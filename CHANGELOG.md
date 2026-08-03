# Changelog

## 0.2.2

### Contrast is now checked in the focused state too

A button can read perfectly well normally and become almost invisible the moment you tab
to it, because the focus style changes the colours. Automated checkers miss this: they
measure the page as it sits, so the button passes while being unusable for the people who
navigate by keyboard and depend on seeing where they are.

The scan now focuses each control it can reach by tabbing, reads the colours the browser
actually renders in that state, and reports anything that passes at rest and fails once
focused, with both ratios so you can see the drop.

Focus styling applied by JavaScript rather than CSS is not covered, and a focus state over
a background photo is left alone rather than guessed at.

## 0.2.1

### Contrast over photos and gradients now gets a real answer

Text sitting on a background photo used to come back as "needs review", because the colour
underneath it cannot be read from CSS. The scan now decodes the image and samples the pixels
behind the text, so you get an actual pass or fail with a number. Dark overlays on hero images
are handled too, the way the browser paints them rather than being written off as unknowable.

Gradients were already resolved, but that had quietly stopped working on sites built with
current CSS. Colours are now read through the browser itself instead of being pattern-matched,
so gradients written with newer colour syntax are measured properly again.

Anything still genuinely unknowable is left as "needs review" rather than guessed. An image
served from another domain cannot be sampled unless that server allows it, and a gradient
painted by a separate overlay element rather than an ancestor of the text is not picked up.

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
