// Contrast edges: the Color Contrast Analyzer view, built from rendered pixels.
//
// Takes a screenshot's RGBA pixels and paints every edge whose two sides differ by at
// least `threshold` (WCAG contrast ratio) in white, everything else in black. Text with
// enough contrast stays legible as an outline; text without it disappears. Because it
// reads what the browser painted, it sees text over photos, gradients, overlays and
// blend modes, which no stylesheet-based check can.
//
// Each pixel is judged by the lightest and darkest pixel in its 3x3 neighbourhood, not
// by its immediate neighbour. Text edges are anti-aliased: the pixel next to a glyph is
// a blend, so a neighbour-to-neighbour ratio understates the real contrast and solid
// black-on-white text would come out broken. The window reaches past the blend to the
// true colours on either side.
//
// This shows, it does not judge. A thin stroke at 1x zoom may have no pixel that is the
// true text colour at all, so very small text can read lower than it is. Zooming the
// page in before capturing gives the window real pixels to work with.
//
// Plain script, no imports: it is loaded by popup.html and by the Node test.

function contrastEdgeMap(rgba, w, h, threshold) {
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        const c = i / 255;
        lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    const n = w * h;
    const lum = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
        lum[p] = 0.2126 * lut[rgba[i]] + 0.7152 * lut[rgba[i + 1]] + 0.0722 * lut[rgba[i + 2]];
    }

    // Separable 3x3 min/max: horizontal pass into rowMin/rowMax, vertical pass reads them.
    const rowMin = new Float32Array(n), rowMax = new Float32Array(n);
    for (let y = 0; y < h; y++) {
        const o = y * w;
        for (let x = 0; x < w; x++) {
            let lo = lum[o + x], hi = lo;
            if (x > 0) { const v = lum[o + x - 1]; if (v < lo) lo = v; if (v > hi) hi = v; }
            if (x < w - 1) { const v = lum[o + x + 1]; if (v < lo) lo = v; if (v > hi) hi = v; }
            rowMin[o + x] = lo; rowMax[o + x] = hi;
        }
    }

    const out = new Uint8ClampedArray(n * 4);
    let edges = 0;
    for (let y = 0; y < h; y++) {
        const o = y * w, up = y > 0 ? o - w : o, dn = y < h - 1 ? o + w : o;
        for (let x = 0; x < w; x++) {
            let lo = rowMin[o + x], hi = rowMax[o + x];
            if (rowMin[up + x] < lo) lo = rowMin[up + x];
            if (rowMax[up + x] > hi) hi = rowMax[up + x];
            if (rowMin[dn + x] < lo) lo = rowMin[dn + x];
            if (rowMax[dn + x] > hi) hi = rowMax[dn + x];
            const v = (hi + 0.05) / (lo + 0.05) >= threshold ? 255 : 0;
            if (v) edges++;
            const i = (o + x) * 4;
            out[i] = out[i + 1] = out[i + 2] = v;
            out[i + 3] = 255;
        }
    }
    return { pixels: out, edges };
}

if (typeof module !== 'undefined') module.exports = { contrastEdgeMap };
