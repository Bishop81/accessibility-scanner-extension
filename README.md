# Accessibility Scanner — Chrome extension (MV3)

Runs the real axe-core engine on the **current tab** and **outlines every offending
element right on the page** (severity-colored, numbered), with a summary in the popup.
Runs entirely locally — no login, no email. Distribution channel #2 (Chrome Web Store).

## Load it (unpacked, for dev)
1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the toolbar icon, open any website, click it → **Scan this page**

## How it works
- `popup.js` injects `axe.min.js` (bundled, v4.12.1) into the active tab via
  `chrome.scripting.executeScript`, then runs `pageScan()` in the page: it runs axe
  (WCAG 2.0/2.1/2.2 A+AA + best-practice), draws absolutely-positioned outline boxes +
  numbered badges over each violation node (scroll-anchored), and returns a summary.
- The popup renders the verdict, a severity scorecard, and the findings list (escaped).
- "Clear outlines" removes the overlays; "Re-scan" refreshes them.

## Scope / notes
- MVP = local scan + on-page outlines + summary. **Account sync is a future enhancement**
  (POST the client-side results to the SaaS to save/share a report — lets users audit
  pages the server can't reach: behind auth, localhost, staging).
- Outlines are placed at scan time; re-scan after DOM changes / resize to refresh.
- Browser/internal pages (`chrome://`, extension pages) can't be scanned — handled with a
  friendly message.
- Design intentionally matches the app (warm paper, teal, serif wordmark, severity colors)
  so it never reads as a generic AI-built extension.

## Before Web Store submission
- Replace placeholder icons if desired; add screenshots + listing copy.
- Localize the listing (cheap reach multiplier — store search is per-language).
- Consider a privacy policy line (it scans locally and sends nothing, which is a selling point).
