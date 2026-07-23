# Changelog

## 0.2.0

### Scans now load the whole page before testing

The scan used to run against the page exactly as it sat, which meant anything not yet
loaded was never checked. On a long page you had just opened, most of it had never
rendered — so the result looked cleaner than the page really was.

Clicking scan now scrolls the page first to pull in lazy-loaded content, waits for images,
fonts and fade-in animations to finish, then tests.

You will see **more issues than before on the same page**. They were always there; the
previous version could not see them. On one real site this was the difference between
reporting 3 contrast failures and 12, with identical colours throughout.

Also fixed: text was sometimes measured part-way through a fade-in, so it was checked at an
opacity no visitor ever sees.

### Slower, deliberately

A scan now takes a few seconds longer, and the page visibly scrolls while it works. That is
the scan doing its job. It is time-bounded, so it always finishes.
