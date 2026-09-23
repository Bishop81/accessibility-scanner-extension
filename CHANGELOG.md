# Changelog

## 0.3.1

### Contrast over a gradient is measured across the whole gradient

Text on a gradient used to be checked only at the gradient's colour stops, on the
assumption that the worst point had to be one of them. It does not. Browsers blend the
colour values as they are stored, and the mix can come out darker than either end, so
dark text could pass at both stops and fail in between. Black text on a red to green
gradient measures 5.25:1 and 9.26:1 at the two stops and 3.49:1 about a third of the way
across, which is a failure the scan used to call a pass.

Gradients are now sampled along their whole length, blended the way the browser paints
them. Light text was never affected, because the lightest point of a blend is always at a
stop.

The same correction applies to the focus-state check, so a control whose focused label
fails partway across a gradient is now reported.

Where a gradient cannot be measured honestly, the result stays "needs review" rather than
passing: gradients blended in a hue-based space, and any colour the browser cannot read
back. The old version quietly ignored colours it could not parse and judged from what was
left.

## 0.3.0

### See the keyboard path through a page

"Show tab order" numbers every tab stop on the page, in the order a keyboard user will
actually reach them. Follow 1, 2, 3 and you can see immediately when the order jumps
somewhere unexpected, which is usually where keyboard users get lost.

It shows rather than judges. Whether an order makes sense is a decision about your
content, so the extension puts the sequence in front of you and leaves the call to you.
Two things it does flag, because both are unambiguous: a positive tabindex, which
reorders the whole document and lands that element first, and an element that can be
tabbed to but is not visible anywhere on screen, so a keyboard user's focus disappears.

Focusability is decided by the browser, not guessed from markup: each candidate is
actually focused and checked. Your scroll position and whatever you had focused are put
back afterwards.

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

## Unreleased — housekeeping for the next version

### Add an MPL carve-out to LICENSE

`LICENSE` declares MIT with no exception, which read strictly appears to cover the bundled
`axe.min.js` as well. That file is axe-core 4.12.1 and is **MPL-2.0**, not MIT.

Nothing is actually mis-licensed today. MPL-2.0 §3.3 permits distributing a Larger Work under
terms of your choice provided the covered files keep their own licence, and `axe.min.js` ships
unmodified with its own banner intact ("Copyright (c) 2015 - 2026 Deque Systems, Inc. Your use of
this Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0"), which
satisfies the notice requirement. MIT remains the correct declaration for our own code, and is what
is declared on the Chrome, Edge and Firefox listings.

The fix is three lines appended to `LICENSE`, to be folded into the next release rather than
rebuilt mid-submission:

    This package bundles axe-core (https://github.com/dequelabs/axe-core), which is licensed
    under the Mozilla Public License 2.0, not the MIT License above. See the notice at the top
    of axe.min.js. A copy of the MPL is available at https://mozilla.org/MPL/2.0/.

### Harden the one unescaped interpolation in popup.js

`renderItem` interpolates `v.impact` into a class attribute without passing it through
`escapeHtml()`. It is safe in practice — axe only ever emits critical/serious/moderate/minor — but
a whitelist check would make the answer to AMO's "unsafe assignment to innerHTML" warning airtight
rather than merely correct. Every other page-derived value is already escaped.
