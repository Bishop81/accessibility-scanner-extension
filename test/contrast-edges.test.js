const test = require('node:test');
const assert = require('node:assert');
const { contrastEdgeMap } = require('../contrast-edges.js');

function canvas(w, h, bg) {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([bg, bg, bg, 255], i * 4);
    return px;
}

function paint(px, w, x0, y0, x1, y1, v) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set([v, v, v, 255], (y * w + x) * 4);
}

function whiteCount(map) {
    let n = 0;
    for (let i = 0; i < map.length; i += 4) if (map[i] === 255) n++;
    return n;
}

test('a block just above 4.5:1 keeps its edges, one just below loses them', () => {
    const w = 20, h = 20;
    const pass = canvas(w, h, 255); paint(pass, w, 5, 5, 15, 15, 0x76);
    const fail = canvas(w, h, 255); paint(fail, w, 5, 5, 15, 15, 0x77);
    assert.ok(contrastEdgeMap(pass, w, h, 4.5).edges > 0);
    assert.strictEqual(contrastEdgeMap(fail, w, h, 4.5).edges, 0);
    assert.ok(contrastEdgeMap(fail, w, h, 3).edges > 0);
});

test('an anti-aliased edge is judged on the true colours either side, not the blend', () => {
    const w = 20, h = 20;
    const px = canvas(w, h, 255);
    paint(px, w, 9, 0, 10, h, 0x80);
    paint(px, w, 10, 0, w, h, 0x76);
    const { pixels } = contrastEdgeMap(px, w, h, 4.5);
    assert.strictEqual(pixels[(10 * w + 9) * 4], 255);
});

test('a flat area produces no edges and output is opaque', () => {
    const w = 8, h = 8;
    const { pixels, edges } = contrastEdgeMap(canvas(w, h, 120), w, h, 3);
    assert.strictEqual(edges, 0);
    assert.strictEqual(whiteCount(pixels), 0);
    for (let i = 3; i < pixels.length; i += 4) assert.strictEqual(pixels[i], 255);
});
