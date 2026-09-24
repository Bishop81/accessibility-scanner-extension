// Firefox build only. popup.js awaits chrome.* calls; in Firefox the promise-returning
// namespace is browser.*, while chrome.* is the callback-compatibility alias. Aliasing
// chrome to browser makes the existing awaits work unchanged. No-op on Chromium.
if (typeof browser !== "undefined" && browser.runtime) {
  try { window.chrome = browser; } catch (e) { /* namespace is frozen; nothing to do */ }
}
