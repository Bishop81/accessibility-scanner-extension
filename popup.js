// Runs in the popup. Injects axe-core into the active tab, runs the WCAG ruleset,
// outlines offending elements on the page, and renders a summary here.

const $ = (id) => document.getElementById(id);
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
let lastScan = null;  // { v, url, result } — source for the exports
const SCAN_VERSION = 2;  // bump when the result shape changes, so stale stored scans aren't restored

async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function runScan() {
    const tab = await activeTab();
    if (!tab || /^(chrome|edge|about|chrome-extension):/.test(tab.url || '')) {
        return showError("This page can't be scanned (browser/internal page). Open a normal website and try again.");
    }

    $('scan').disabled = true;
    $('scan').textContent = 'Scanning…';

    try {
        // 1) inject axe-core, 2) run it + draw overlays, return the summary.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['axe.min.js'] });
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageScan });
        renderResults(result);
        lastScan = { v: SCAN_VERSION, url: tab.url, result };
        // Persist so reopening the popup shows the same scan instead of a blank slate.
        await chrome.storage.session.set({ ['scan_' + tab.id]: lastScan });
    } catch (e) {
        showError('Could not scan this page. ' + (e?.message || ''));
    } finally {
        $('scan').disabled = false;
        $('scan').textContent = 'Scan this page';
    }
}

async function clearOutlines() {
    const tab = await activeTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageClear });
    await chrome.storage.session.remove('scan_' + tab.id);
    $('results').classList.add('hidden');
    $('error').classList.add('hidden');
    $('intro').classList.remove('hidden');
}

function renderResults(r) {
    if (!r) return showError('No result returned.');
    $('intro').classList.add('hidden');
    $('error').classList.add('hidden');
    $('results').classList.remove('hidden');

    const total = IMPACTS.reduce((s, k) => s + (r.counts[k] || 0), 0);
    $('verdict').innerHTML = total === 0
        ? `No automated violations. <span style="color:var(--ink-soft)">Some checks still need a human.</span>`
        : `<span class="num" style="color:var(--critical)">${total}</span> automated ${total === 1 ? 'issue' : 'issues'} · ${r.affected} elements outlined`;

    const tiles = [...IMPACTS.map((k) => [k, k, r.counts[k] || 0]), ['review', 'review', r.manualReview]];
    $('scorecard').innerHTML = tiles.map(([cls, label, n]) =>
        `<div class="tile t-${cls} ${n === 0 ? 'zero' : ''}"><div class="n">${n}</div><div class="l">${label}</div></div>`
    ).join('');

    const renderItem = (v, isReview) => `
            <li>
                <span class="fnum d-${isReview ? 'review' : (v.impact || 'minor')}" title="Matches the badge numbered ${v.num} on the page">${v.num}</span>
                <span class="finding-main">
                    <span class="finding-rule">${escapeHtml(v.id)}${isReview ? ' <span class="tag-review">needs review</span>' : ''}</span>
                    <span class="finding-help">${escapeHtml(v.help)}.</span>
                    ${v.helpUrl ? `<a class="finding-fix" href="${escapeHtml(v.helpUrl)}" target="_blank" rel="noopener noreferrer">How to fix ↗</a>` : ''}
                </span>
                <span class="finding-count">${v.count}×</span>
            </li>`;
    const items = [...r.list.map((v) => renderItem(v, false)), ...(r.review || []).map((v) => renderItem(v, true))];
    $('findings').innerHTML = items.length === 0
        ? `<li style="color:var(--ink-soft)">Nothing flagged by automated checks.</li>`
        : items.join('');
}

function showError(msg) {
    $('intro').classList.add('hidden');
    $('results').classList.add('hidden');
    $('error').classList.remove('hidden');
    $('error').querySelector('.err').textContent = msg;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('scan').addEventListener('click', runScan);
$('rescan').addEventListener('click', runScan);
$('clear').addEventListener('click', clearOutlines);
$('copy').addEventListener('click', copyReport);
$('json').addEventListener('click', exportJson);

// ─── Exports: a Markdown report (paste into an AI agent / issue) + raw JSON ───

function buildMarkdown(scan) {
    const r = scan.result, order = ['critical', 'serious', 'moderate', 'minor'];
    const total = order.reduce((s, k) => s + (r.counts[k] || 0), 0);
    const indent = (s) => (s || '').replace(/\n+/g, '\n    ').trim();
    let md = `# Accessibility report\n\n- URL: ${scan.url}\n- Engine: axe-core${r.engine ? ' ' + r.engine : ''}\n`;
    md += `- Result: ${total === 0 ? 'no automated violations' : `${total} automated issue(s) across ${r.affected} element(s)`}\n\n`;
    md += `> Covers the machine-testable subset of WCAG (2.0/2.1/2.2 A & AA + best-practice). Items needing manual review are not listed.\n`;
    const byImpact = {};
    for (const f of r.list) (byImpact[f.impact] || (byImpact[f.impact] = [])).push(f);
    for (const imp of order) {
        if (!byImpact[imp]) continue;
        md += `\n## ${imp[0].toUpperCase() + imp.slice(1)}\n`;
        for (const f of byImpact[imp]) {
            md += `\n### ${f.id} — ${f.help} (${f.count} element${f.count === 1 ? '' : 's'})\n`;
            if (f.helpUrl) md += `Fix guide: ${f.helpUrl}\n`;
            for (const nd of (f.nodes || [])) {
                md += `\n- selector: \`${nd.target}\`\n`;
                if (nd.html) md += `    html: \`${nd.html.replace(/`/g, "'")}\`\n`;
                if (nd.summary) md += `    issue: ${indent(nd.summary)}\n`;
            }
            if (f.count > (f.nodes || []).length) md += `\n_(+${f.count - f.nodes.length} more element(s) not listed)_\n`;
        }
    }
    if (r.review && r.review.length) {
        md += `\n## Needs manual review\n> axe could not decide these automatically; a person should check them.\n`;
        for (const f of r.review) {
            md += `\n### ${f.id} — ${f.help} (${f.count} element${f.count === 1 ? '' : 's'})\n`;
            if (f.helpUrl) md += `Fix guide: ${f.helpUrl}\n`;
            for (const nd of (f.nodes || [])) {
                md += `\n- selector: \`${nd.target}\`\n`;
                if (nd.html) md += `    html: \`${nd.html.replace(/`/g, "'")}\`\n`;
                if (nd.summary) md += `    why: ${indent(nd.summary)}\n`;
            }
            if (f.count > (f.nodes || []).length) md += `\n_(+${f.count - f.nodes.length} more element(s) not listed)_\n`;
        }
    }
    return md + `\n---\nGenerated by Accessibility Scanner — https://accessibilityscanner.app\n`;
}

function buildJson(scan) {
    return JSON.stringify({
        url: scan.url,
        engine: 'axe-core' + (scan.result.engine ? ' ' + scan.result.engine : ''),
        counts: scan.result.counts,
        affectedElements: scan.result.affected,
        manualReview: scan.result.manualReview,
        passes: scan.result.passes,
        findings: scan.result.list,
        needsReview: scan.result.review || [],
    }, null, 2);
}

function fileName(url, ext) {
    let host = 'page';
    try { host = new URL(url).hostname || 'page'; } catch (e) { /* keep default */ }
    return `a11y-${host}.${ext}`;
}

async function copyReport() {
    if (!lastScan) return;
    const text = buildMarkdown(lastScan);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            ok = document.execCommand('copy'); ta.remove();
        } catch (e2) { ok = false; }
    }
    const btn = $('copy');
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => { btn.textContent = btn.dataset.label; }, 1400);
}

function exportJson() {
    if (!lastScan) return;
    const blob = new Blob([buildJson(lastScan)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(lastScan.url, 'json');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// On reopen, restore the last scan for this tab — but only if its outlines are
// still on the page (a reload wipes them, so we fall back to a fresh start).
async function restore() {
    try {
        const tab = await activeTab();
        if (!tab) return;
        const key = 'scan_' + tab.id;
        const saved = (await chrome.storage.session.get(key))[key];
        if (!saved || saved.url !== tab.url || saved.v !== SCAN_VERSION) {
            if (saved) await chrome.storage.session.remove(key);
            return;
        }
        const [{ result: outlineCount }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.querySelectorAll('.a11ysc-ov').length,
        });
        if (!outlineCount) { await chrome.storage.session.remove(key); return; }
        lastScan = saved;
        renderResults(saved.result);
    } catch (e) { /* leave the intro showing */ }
}

restore();

// ─── Injected into the page (must be self-contained) ───

async function pageScan() {
    document.querySelectorAll('.a11ysc-ov, .a11ysc-bg, .a11ysc-tip').forEach((e) => e.remove());

    const colors = { critical: '#b42318', serious: '#b54708', moderate: '#175cd3', minor: '#4a5567' };

    const results = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        resultTypes: ['violations', 'incomplete', 'passes'],
    });

    // Resolve color-contrast axe punted on over a CSS gradient (worst-case at a stop
    // → real pass/fail). Mirrors scripts/scan.mjs — keep in sync. Images/translucent
    // gradients stay incomplete. Wrapped so it can never break the scan.
    try {
        const ci = results.incomplete.findIndex((x) => x.id === 'color-contrast');
        if (ci !== -1) {
            const entry = results.incomplete[ci];
            const parseRgb = (s) => { const m = (s || '').match(/rgba?\(([^)]+)\)/i); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
            const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
            const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
            const contrast = (a, b) => { const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b)); return (hi + 0.05) / (lo + 0.05); };
            const keep = [], failed = [];
            for (const node of entry.nodes) {
                try {
                    const sel = Array.isArray(node.target) ? node.target[node.target.length - 1] : node.target;
                    const el = document.querySelector(sel);
                    if (!el) { keep.push(node); continue; }
                    const cs = getComputedStyle(el);
                    const fg = parseRgb(cs.color);
                    if (!fg) { keep.push(node); continue; }
                    const fontPx = parseFloat(cs.fontSize) || 16, weight = parseInt(cs.fontWeight, 10) || 400;
                    const required = (fontPx >= 24 || (fontPx >= 18.66 && weight >= 700)) ? 3 : 4.5;
                    let bg = null;
                    for (let hop = el; hop; hop = hop.parentElement) { const bi = getComputedStyle(hop).backgroundImage; if (bi && bi.indexOf('gradient(') !== -1) { bg = bi; break; } }
                    if (!bg || bg.indexOf('url(') !== -1) { keep.push(node); continue; }
                    const stops = (bg.match(/rgba?\([^)]+\)/gi) || []).map(parseRgb).filter(Boolean);
                    if (!stops.length || stops.some((s) => s.a < 1)) { keep.push(node); continue; }
                    let worst = Infinity; for (const s of stops) worst = Math.min(worst, contrast(fg, s));
                    if (worst < required) { node.failureSummary = `Background gradient: lowest-contrast point is ${worst.toFixed(2)}:1, below ${required}:1.`; failed.push(node); }
                } catch (e) { keep.push(node); }
            }
            if (keep.length) { entry.nodes = keep; } else { results.incomplete.splice(ci, 1); }
            if (failed.length) {
                let v = results.violations.find((x) => x.id === 'color-contrast');
                if (!v) { v = { id: entry.id, impact: entry.impact || 'serious', description: entry.description, help: entry.help, helpUrl: entry.helpUrl, tags: entry.tags, nodes: [] }; results.violations.push(v); }
                for (const n of failed) v.nodes.push(n);
            }
        }
    } catch (e) { /* never break the scan */ }

    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const list = [];
    const review = [];
    let n = 0;       // violation elements outlined (for the summary line)
    let fnum = 0;    // finding number: shown on every badge for that rule + in the list

    const slimNodes = (nodes) => nodes.slice(0, 30).map((nd) => ({
        target: Array.isArray(nd.target) ? nd.target.join(' ') : String(nd.target),
        summary: (nd.failureSummary || '').trim(),
        html: (nd.html || '').slice(0, 300),
    }));

    // Outline one element + attach its hover badge. Returns true if it was drawn.
    const draw = (node, num, color, dashed, ruleId, impact) => {
        let el;
        try { el = document.querySelector(Array.isArray(node.target) ? node.target[0] : node.target); } catch (e) { el = null; }
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const x = r.left + window.scrollX, y = r.top + window.scrollY;

        const box = document.createElement('div');
        box.className = 'a11ysc-ov';
        Object.assign(box.style, {
            position: 'absolute', left: x + 'px', top: y + 'px',
            width: r.width + 'px', height: r.height + 'px',
            border: '2px ' + (dashed ? 'dashed' : 'solid') + ' ' + color, borderRadius: '2px',
            boxShadow: '0 0 0 1px rgba(255,255,255,.55)', zIndex: 2147483646, pointerEvents: 'none',
        });
        document.body.appendChild(box);

        const summary = (node.failureSummary || '').trim();
        const detail = '#' + num + '  ' + (dashed ? 'needs review: ' : '') + ruleId + '  (' + impact + ')'
            + (summary ? '\n\n' + summary.slice(0, 500) : '');

        const badge = document.createElement('div');
        badge.className = 'a11ysc-bg';
        badge.textContent = num;
        // Native title tooltip: survives the injected-script context (a custom JS
        // tooltip's listeners do not), and shows the full detail on hover.
        badge.title = detail;
        Object.assign(badge.style, {
            position: 'absolute', left: x + 'px', top: Math.max(0, y - 18) + 'px',
            background: color, color: '#fff', font: '600 11px/1.4 ui-monospace,monospace',
            padding: '0 5px', borderRadius: '3px', zIndex: 2147483647, pointerEvents: 'auto', cursor: 'help',
        });
        document.body.appendChild(badge);
        return true;
    };

    for (const v of results.violations) {
        fnum++;
        counts[v.impact] = (counts[v.impact] || 0) + 1;
        list.push({ num: fnum, id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, count: v.nodes.length, nodes: slimNodes(v.nodes) });
        const color = colors[v.impact] || colors.minor;
        for (const node of v.nodes) { if (draw(node, fnum, color, false, v.id, v.impact || 'minor')) n++; }
    }

    // Needs manual review: axe couldn't decide automatically. Dashed purple so it
    // reads as "check this", not "definite failure".
    for (const v of results.incomplete) {
        fnum++;
        review.push({ num: fnum, id: v.id, impact: 'review', help: v.help, helpUrl: v.helpUrl, count: v.nodes.length, nodes: slimNodes(v.nodes) });
        for (const node of v.nodes) { draw(node, fnum, '#6941c6', true, v.id, 'review'); }
    }

    return {
        counts, affected: n, manualReview: results.incomplete.length,
        passes: results.passes.length, list, review,
        engine: results.testEngine && results.testEngine.version,
    };
}

function pageClear() {
    document.querySelectorAll('.a11ysc-ov, .a11ysc-bg, .a11ysc-tip').forEach((e) => e.remove());
}
