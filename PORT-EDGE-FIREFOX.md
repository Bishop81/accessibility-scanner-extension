# Porting the extension to Edge and Firefox

Built 2026-09-23 against Chrome release **0.3.1**. Both packages are in `dist/`.
Chris has created the Edge Partner Center and AMO accounts; **no API credentials are on this
machine**, so the final upload is a manual step (or needs creds supplied — see below).

## Edge — `dist/accessibility-scanner-edge-0.3.1.zip`

**No code changes at all.** Edge is Chromium MV3 and this extension is unusually portable: there is
no background service worker, and the only APIs used are `scripting.executeScript`,
`storage.session` and `tabs.query`. Verified byte-identical to the Chrome shipping files
(`cmp` on all six + `icons/`).

Submit at Partner Center → Microsoft Edge program. The Chrome listing copy in `store/` applies as-is.

## Firefox — `dist/accessibility-scanner-firefox-0.3.1.zip`

Three changes, all in `firefox-src/` (kept separate so the Chrome build is never affected):

1. **`browser_specific_settings.gecko`** — AMO requires an extension id. Set to
   `accessibility-scanner@accessibilityscanner.app`, `strict_min_version` **115.0**.
2. **🔴 The name had to be SHORTENED. This was a hard submission blocker.**
   `web-ext lint` fails with `JSON_INVALID: "/name" must NOT have more than 45 characters`.
   The Chrome name is 58 chars (Chrome's limit is 75), so **AMO would have rejected the upload**.
   Firefox ships `Accessibility Scanner — WCAG & Contrast` (39). **The Chrome/Edge name is unchanged.**
3. **`data_collection_permissions: {required: ["none"]}`** — AMO now expects an explicit declaration.
   The extension collects nothing, which matches the product's "no login, no email" positioning.

### Why 115.0 and not lower
`storage.session` landed in Firefox **115** (MDN browser-compat-data); `scripting` is available from
102, so session storage sets the floor. Checked and NOT used, each of which would have raised the
floor: `world: "MAIN"` (would need 128), `documentIds` (153), `storage.session.setAccessLevel()`
(**not supported in Firefox at all**).

### ⚠️ `browser-shim.js` — insurance, NOT a verified fix
`popup.js` does `await chrome.*` in 12 places. MDN states Firefox "supports `chrome` and callbacks as
well as `browser` and Promises", but **current MDN no longer states what `await chrome.x()` actually
returns in Firefox** — the older explicit wording was removed when the pages were rewritten for
Chrome 148+. So the risk is real but unconfirmed. The shim aliases `chrome` to `browser` (promise-based)
and is a no-op on Chromium.

**This is the one thing that needs a real runtime test before release.** Load the unpacked Firefox
build via `about:debugging` and run one scan. If it works with the shim removed, drop the shim; if it
only works with it, the shim was necessary. Do not ship on the assumption either way.

### Lint status
`web-ext lint`: **0 errors**, 15 warnings. The warnings are `UNSAFE_VAR_ASSIGNMENT` (innerHTML, ×3 in
`popup.js`) and `DANGEROUS_EVAL` (the `Function` constructor, inside `axe.min.js` — third-party and
unavoidable). Human reviewers see these; axe-core is well known, so they should pass, but expect them
to be raised.

## Submitting

Neither store's credentials exist here. Options: Chris uploads both zips by hand, or supplies
Edge Partner Center (client id/secret/access-token URL) and AMO (JWT issuer + secret) credentials so
this can be scripted the way `overwatch/chrome_extension_publish.py` does for Chrome.

**Order:** Edge first (no code change, so nothing to go wrong), then Firefox after the runtime test.
Ping the backlinks lane when each is live — they are tracking these as listing-gap wins.
