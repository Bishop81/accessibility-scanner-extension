# Accessibility Scanner — Chrome extension

Instant, honest WCAG accessibility audit of any web page, right in your browser.
Click the toolbar button and it runs the real [axe-core](https://github.com/dequelabs/axe-core)
engine on the current tab, outlines every failing element on the page with a numbered badge,
and shows a summary you can act on. It runs entirely locally: no login, no email, and nothing
about the pages you scan ever leaves your machine.

Part of [accessibilityscanner.app](https://accessibilityscanner.app) — the hosted version adds
multi-page audits, saved history, and scheduled monitoring that catches regressions over time.

## What it does

- **Outlines issues on the page** — each failing element gets a severity-colored box and a
  number that maps to the popup list. Hover a badge to see that element's exact failure.
- **Honest results** — issues grouped by impact, with a "how to fix" link per rule, and items
  that still need a human flagged as "needs review" rather than hidden. It never claims you are
  "compliant."
- **Checks lazy-loaded content** — the page is scrolled before testing, so sections that had not
  rendered yet get checked instead of silently skipped. Most scanners only test what was on screen.
- **Resolves gradient contrast** — where axe leaves color-contrast as "needs review" because the
  text sits on a CSS gradient, this measures the worst-case contrast and gives a real pass/fail.
- **Export for an AI agent or developer** — copy a Markdown report or download JSON, each with the
  selector, the exact failure, and a fix link, ready to hand to a coding agent or drop into an issue.

## Install

- **Chrome Web Store:** listing pending review. (Link will go here once published.)
- **Load unpacked (for development):**
  1. Open `chrome://extensions`
  2. Enable **Developer mode** (top right)
  3. **Load unpacked** and select this folder
  4. Pin the toolbar icon, open any website, and click it

## How it works

The popup injects the bundled `axe-core` into the active tab via `chrome.scripting.executeScript`,
runs the WCAG 2.0/2.1/2.2 A and AA rules (plus best-practice), draws the outlines, and renders the
summary. Everything happens in the page and the popup. The only data stored is the most recent
result, kept in `chrome.storage.session` so reopening the popup does not force a re-scan; it clears
when the browser session ends. No network requests are made to any server.

## Permissions

- `activeTab` and `scripting` — to run the check on the page you are viewing, only when you click the button.
- `storage` — to remember the last scan for the current tab during the session.

No host permissions, no remote code, no data collection. See the
[privacy policy](https://accessibilityscanner.app/privacy).

## License

MIT
