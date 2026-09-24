#!/usr/bin/env python3
"""
Upload a new DomainIntel version to addons.mozilla.org.

The Firefox counterpart to publish.py. Different auth, different API, different
rules, so it is a separate file rather than a flag on that one.

    python3 extension/publish-firefox.py --status
    python3 extension/publish-firefox.py --upload extension/domainintel-extension-1.0.3-firefox.zip

  --status   authenticate and print what AMO holds. Read-only, and the right
             first call after any credential change.
  --upload   push a new version into the listed channel. Not irreversible the
             way Chrome's --publish is: AMO queues it for review, and a version
             can be disabled afterwards. It cannot be un-uploaded, though, and
             the version number is consumed either way.

Credentials are AMO_JWT_ISSUER and AMO_JWT_SECRET in .env (gitignored). Generate
them at https://addons.mozilla.org/en-US/developers/addon/api/key/ — note that
issuing a new pair silently invalidates the old one.

⚠️ Listing text, categories, screenshots and the privacy policy are NOT settable
here. They are dashboard-only, exactly as on Chrome. extension/STORE-LISTING.md
holds the text to paste.

⚠️ The JWT is valid for five minutes at most and AMO rejects a longer exp
outright. Each request below mints a fresh one rather than reusing a token, so a
slow upload cannot expire mid-flight.
"""

import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import pathlib
import secrets
import sys
import time
import urllib.error
import urllib.request

API = "https://addons.mozilla.org/api/v5"
# AMO add-on id: accessibility-scanner-webext@accessibilityscanner.app
# (the first id was burned when the initial listing was deleted - AMO reserves ids
# permanently, including for deleted add-ons. Never delete the listing.)
SLUG = "accessibility-scanner-wcag"
# See the note in publish-edge.py: credentials are account-level and live in
# domainintel.app/.env. Not duplicated here.
ENV = pathlib.Path("/home/chris/Documents/Dev/projects/personal/active/domainintel.app/.env")


def creds():
    """Read the key pair from .env without importing a dotenv dependency."""
    issuer = os.environ.get("AMO_JWT_ISSUER")
    secret = os.environ.get("AMO_JWT_SECRET")
    if not (issuer and secret) and ENV.exists():
        for line in ENV.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if k.strip() == "AMO_JWT_ISSUER" and not issuer:
                issuer = v
            elif k.strip() == "AMO_JWT_SECRET" and not secret:
                secret = v
    if not issuer or not secret:
        sys.exit("AMO_JWT_ISSUER / AMO_JWT_SECRET not found in the environment or .env")
    return issuer, secret


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=")


def token():
    """
    A fresh HS256 JWT. Hand-rolled rather than pulling in PyJWT: the whole
    algorithm is three lines and this script otherwise needs no dependencies,
    which is what lets it run under any python3 on the box.
    """
    issuer, secret = creds()
    now = int(time.time())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64(json.dumps({
        "iss": issuer,
        "jti": secrets.token_hex(16),
        "iat": now,
        # AMO rejects anything beyond five minutes. Sixty seconds is plenty for
        # one request and limits the damage if a token is ever logged.
        "exp": now + 60,
    }, separators=(",", ":")).encode())
    signing_input = header + b"." + payload
    sig = b64(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return (signing_input + b"." + sig).decode()


def call(url, *, method="GET", body=None, content_type=None):
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"JWT {token()}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        # 401 here means the key pair, not the add-on. A missing add-on is 404.
        hint = "  (check AMO_JWT_ISSUER / AMO_JWT_SECRET)" if e.code == 401 else ""
        sys.exit(f"HTTP {e.code} {method} {url}{hint}\n{detail}")


def multipart(fields, files):
    """Encode multipart/form-data by hand; urllib has no helper for it."""
    boundary = "----domainintel" + secrets.token_hex(16)
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, path in files.items():
        p = pathlib.Path(path)
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        out += (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"{k}\"; filename=\"{p.name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n"
        ).encode()
        out += p.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def status():
    d = call(f"{API}/addons/addon/{SLUG}/")
    name = (d.get("name") or {})
    print(f"  slug      {d.get('slug')}")
    print(f"  name      {name.get('en-US') or next(iter(name.values()), '?')}")
    print(f"  status    {d.get('status')}")
    print(f"  listed    {d.get('is_listed')}")
    print(f"  url       {d.get('url')}")
    cur = d.get("current_version") or {}
    print(f"  version   {cur.get('version') or '(none public yet)'}")
    for f in cur.get("files") or []:
        print(f"    file    {f.get('status')}  signed={f.get('is_mozilla_signed_extension')}")
    return d


def upload(zip_path):
    p = pathlib.Path(zip_path)
    if not p.exists():
        sys.exit(f"no such file: {p}")

    body, ctype = multipart({"channel": "listed"}, {"upload": str(p)})
    print(f"uploading {p.name} ({p.stat().st_size} bytes)")
    up = call(f"{API}/addons/upload/", method="POST", body=body, content_type=ctype)
    uuid = up.get("uuid")
    print(f"  upload uuid {uuid}")

    # AMO validates asynchronously. Poll rather than assume: an invalid package
    # is reported here, before the version exists, which is the cheap place to
    # find out.
    for _ in range(60):
        if up.get("processed"):
            break
        time.sleep(5)
        up = call(f"{API}/addons/upload/{uuid}/")
    if not up.get("processed"):
        sys.exit("validation did not finish in five minutes; check the dashboard")

    v = up.get("validation") or {}
    print(f"  valid={up.get('valid')}  errors={v.get('errors')}  warnings={v.get('warnings')}")
    if not up.get("valid"):
        for m in (v.get("messages") or []):
            if m.get("type") == "error":
                print(f"    ERROR {m.get('message')}")
        sys.exit("package rejected by validation; nothing was submitted")

    ver = call(f"{API}/addons/addon/{SLUG}/versions/", method="POST",
               body=json.dumps({"upload": uuid}).encode(), content_type="application/json")
    print(f"  version {ver.get('version')} created, channel {ver.get('channel')}")
    print("Queued for review. Listing text stays as the dashboard has it.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true", help="authenticate and show what AMO holds")
    ap.add_argument("--upload", metavar="ZIP", help="upload a new version to the listed channel")
    a = ap.parse_args()

    if a.status:
        status()
    elif a.upload:
        upload(a.upload)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
