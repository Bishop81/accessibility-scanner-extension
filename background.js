// Background half of "Show contrast edges".
//
// The popup closes the moment you click the page, and its code goes with it, so the
// popup cannot re-take the screenshot after a scroll. This script can. The popup asks
// it for the first capture; after that the overlay in the page asks it directly each
// time scrolling or resizing settles.
//
// No extra permission is involved: the activeTab grant from clicking the toolbar button
// belongs to the extension, not the popup, and lasts until the tab navigates.
//
// Chrome loads this as a service worker and needs importScripts for the shared core.
// Firefox loads it as a background script with contrast-edges.js listed before it.

if (typeof contrastEdgeMap === 'undefined' && typeof importScripts === 'function') {
    importScripts('contrast-edges.js');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'a11ysc-edges-start') {
        capture(msg.tabId, msg.windowId, msg.min, 0, true)
            .then((r) => sendResponse({ ok: true, ...r }))
            .catch((e) => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
        return true;
    }
    if (msg && msg.type === 'a11ysc-edges-recapture' && sender.tab) {
        const { id, windowId } = sender.tab;
        capture(id, windowId, msg.min, msg.seq, false).catch(() => {
            // A failed re-capture would leave a hidden overlay still listening for
            // scrolls, so take it down rather than leave the page in a half state.
            chrome.scripting.executeScript({ target: { tabId: id }, func: pageEdgesDrop }).catch(() => {});
        });
    }
    return false;
});

async function capture(tabId, windowId, min, seq, initial) {
    await chrome.scripting.executeScript({ target: { tabId }, func: pageOverlaysHide });
    let shot;
    try {
        shot = await captureWithRetry(windowId);
    } finally {
        await chrome.scripting.executeScript({ target: { tabId }, func: pageOverlaysRestore }).catch(() => {});
    }

    const bitmap = await createImageBitmap(dataUrlToBlob(shot));
    const w = bitmap.width, h = bitmap.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    const { pixels } = contrastEdgeMap(ctx.getImageData(0, 0, w, h).data, w, h, min);
    ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
    const url = await blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));

    const [{ result: cssWidth }] = await chrome.scripting.executeScript({
        target: { tabId }, func: pageEdgesShow, args: [url, min, seq, initial],
    });
    return { width: w, cssWidth };
}

// Chrome allows about two captures a second. Scrolling that stops, starts and stops
// again can hit that, and one short wait is enough to get under it.
async function captureWithRetry(windowId) {
    try {
        return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (e) {
        if (!/MAX_CAPTURE|quota|rate/i.test((e && e.message) || '')) throw e;
        await new Promise((r) => setTimeout(r, 600));
        return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    }
}

function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/png' });
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

// ─── Injected into the page; each must be self-contained ───

function pageOverlaysHide() {
    document.querySelectorAll('.a11ysc-ov, .a11ysc-bg, .a11ysc-tip, .a11ysc-fo, .a11ysc-fob').forEach((e) => {
        e.dataset.a11yscVis = e.style.visibility;
        e.style.visibility = 'hidden';
    });
    // Two frames so the hide has actually been painted before the screenshot is taken.
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))));
}

function pageOverlaysRestore() {
    document.querySelectorAll('[data-a11ysc-vis]').forEach((e) => {
        e.style.visibility = e.dataset.a11yscVis;
        delete e.dataset.a11yscVis;
    });
}

function pageEdgesDrop() {
    document.querySelectorAll('.a11ysc-ce').forEach((e) => { if (e._a11yscOff) e._a11yscOff(); e.remove(); });
}

// The map is a picture of the viewport at capture time. While the page moves it is
// hidden, because a map that no longer lines up is worse than none; once scrolling
// settles the page asks for a fresh one. `seq` counts scrolls, so a capture that was
// already in flight when the user scrolled again is thrown away instead of shown
// over the wrong part of the page.
function pageEdgesShow(url, min, seq, initial) {
    let wrap = document.querySelector('.a11ysc-ce');

    if (!initial) {
        if (!wrap || wrap._a11yscSeq !== seq) return null;
        const img = wrap.querySelector('img');
        img.src = url;
        img.decode().catch(() => {}).then(() => {
            if (wrap.isConnected && wrap._a11yscSeq === seq) wrap.style.visibility = 'visible';
        });
        return window.innerWidth;
    }

    if (wrap) { if (wrap._a11yscOff) wrap._a11yscOff(); wrap.remove(); }
    wrap = document.createElement('div');
    wrap.className = 'a11ysc-ce';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Contrast edges view');
    Object.assign(wrap.style, {
        position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
        background: '#000', zIndex: 2147483647, cursor: 'pointer', margin: '0', padding: '0',
    });

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Edges on this page with at least ' + min + ':1 contrast';
    Object.assign(img.style, {
        display: 'block', width: '100%', height: '100%', maxWidth: 'none', margin: '0',
        objectFit: 'fill', pointerEvents: 'none',
    });
    wrap.appendChild(img);

    const chip = document.createElement('div');
    chip.textContent = 'Contrast edges ≥ ' + min + ':1 · white passes, missing text does not · scroll to move, click or Esc to close';
    Object.assign(chip.style, {
        position: 'absolute', left: '12px', bottom: '12px', background: '#0d5c54', color: '#fff',
        font: '600 12px/1.4 ui-sans-serif,system-ui,sans-serif', padding: '6px 10px', borderRadius: '6px',
        boxShadow: '0 0 0 1px rgba(255,255,255,.6)', pointerEvents: 'none',
    });
    wrap.appendChild(chip);

    wrap._a11yscSeq = 0;
    let timer = null;
    const moved = () => {
        wrap._a11yscSeq++;
        wrap.style.visibility = 'hidden';
        clearTimeout(timer);
        const mine = wrap._a11yscSeq;
        timer = setTimeout(() => {
            try {
                chrome.runtime.sendMessage({ type: 'a11ysc-edges-recapture', min, seq: mine });
            } catch (e) {
                close();   // extension reloaded or updated underneath the page
            }
        }, 350);
    };
    const close = () => { off(); wrap.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const off = () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', moved);
        window.removeEventListener('resize', moved);
        window.removeEventListener('keydown', onKey, true);
    };
    wrap._a11yscOff = off;
    wrap.addEventListener('click', close);
    // Not capture: an auto-scrolling carousel inside the page must not trigger re-captures.
    window.addEventListener('scroll', moved, { passive: true });
    window.addEventListener('resize', moved);
    window.addEventListener('keydown', onKey, true);

    document.documentElement.appendChild(wrap);
    return window.innerWidth;
}
