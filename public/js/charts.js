// Small hand-rolled SVG charts (no library): bars, sparkline, and a step line chart with hover.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '/vendor/preact-hooks.mjs';
import { html, StoreDot } from './ui.js';
import { shortDate, plural } from './format.js';

function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const set = () => setW(Math.max(160, Math.floor(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

/**
 * The y-axis for a price chart: a domain [lo, hi] and the gridlines that label it.
 *
 * The contract, for EVERY input: lo <= min, hi >= max, and lo and hi are themselves labelled
 * ticks — so the highest point on the chart always sits at or below a labelled gridline and the
 * lowest at or above one. A chart of prices whose peak floats above the top label has an unread-
 * able maximum, which is the number people look at a price chart for.
 *
 * The version this replaces picked a step, snapped the domain out to it, then asked for a tick
 * step AGAIN over the wider domain — and the wider domain could earn a LARGER step, which the
 * snapped hi was not a multiple of, so the top tick fell back below the data. Checked by hand on
 * one series it looked right; fuzzed, 4-12% of random series still ended above the top label
 * (e.g. data 5.46..6.05 → ticks 5.5, 6). Here the step is chosen once, as the smallest "nice"
 * step whose snapped domain needs no more than `count` intervals, and the ticks are generated
 * from that same step, so there is nothing left to disagree. test/qa-chart-scale.test.js checks
 * the contract over randomised series.
 *
 * `minStep` is the resolution of the axis labels: a number, or a function of the value for a
 * formatter whose precision changes with magnitude (unitPriceStep in format.js: "$3.05" to the
 * cent, "45.5¢" to a tenth of a cent). Every gridline must sit exactly on a value its label can
 * show. Money is formatted to the cent, so a $0.025 step would print "$3.98" on a gridline that is
 * really at $3.975 — a label more precise than the line it names, and half a cent wrong. Candidate
 * steps whose gridlines fall between representable values are skipped.
 */
export function niceDomain(min, max, { count = 4, minStep = 0 } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  if (!(max > min)) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const resolutionAt = typeof minStep === 'function' ? minStep : () => minStep;
  const labelable = (v) => {
    const q = resolutionAt(Math.abs(v));
    return !(q > 0) || Math.abs(Math.round(v / q) * q - v) < q * 1e-6;
  };
  const raw = (max - min) / count;
  let exp = Math.floor(Math.log10(raw)) - 1;
  for (let guard = 0; guard < 40; guard++, exp++) {
    const mag = Math.pow(10, exp);
    for (const m of [1, 2, 2.5, 5]) {
      const step = +(m * mag).toPrecision(12);
      const a = Math.floor(min / step + 1e-9);
      const b = Math.ceil(max / step - 1e-9);
      if (b - a > count) continue;
      const ticks = [];
      for (let k = a; k <= b; k++) ticks.push(+(k * step).toFixed(10));
      // Guard the contract against floating point rather than trusting it: if rounding put a
      // bound on the wrong side of the range by more than rounding noise, widen by one step.
      const eps = step * 1e-6;
      if (ticks[0] > min + eps) ticks.unshift(+(ticks[0] - step).toFixed(10));
      if (ticks[ticks.length - 1] < max - eps) ticks.push(+(ticks[ticks.length - 1] + step).toFixed(10));
      if (!ticks.every(labelable)) continue;
      return { lo: ticks[0], hi: ticks[ticks.length - 1], step, ticks };
    }
  }
  return { lo: min, hi: max, step: max - min, ticks: [min, max] };
}

// ---------------- horizontal bars ----------------
/**
 * rows: [{ id, storeId, label, value, text, sub, best, close, basis }]
 * One hue for magnitude, the winner emphasized (and labeled "Best" — never color alone).
 * `close`: within the price-basis margin of the winner (shared/compare.js standings), so it is
 * labelled "about the same" rather than drawn as beaten. `basis`: a non-shelf price source,
 * shown on the row itself ("Instacart", "national"), not only in the note under the chart.
 */
export function BestBars({ rows, onPick, note }) {
  const [tip, setTip] = useState(null);
  const box = useRef();
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.value));
  return html`<div class="chart" ref=${box}>
    <div class="bars" role="list">
      ${rows.map((r) => {
        const pctW = max > 0 ? Math.max(2, (r.value / max) * 100) : 2;
        // A real <button> inside the listitem, not a listitem that behaves like one. These rows
        // were role="listitem" with tabindex=0 and an Enter/Space handler, so a screen reader
        // announced "list item" for something that opens a dialog — and the Space branch never
        // called preventDefault, so Space both activated the row and scrolled the page. A native
        // button gets the role, the keyboard behaviour and the scroll suppression for free.
        //
        // showTip is bound to focus as well as hover: the product behind the number ("Food Club
        // Cranberry Sauce, Jellied · 14 fl oz — $1.49") lived only in the mouse tip, so a keyboard
        // or touch user got the store and the unit price and nothing else (SC 1.4.13). It is in
        // the aria-label too, for anyone who never sees the tip at all.
        const showTip = (e) => {
          const b = box.current.getBoundingClientRect();
          const rb = e.currentTarget.getBoundingClientRect();
          setTip({ x: rb.left - b.left + 90, y: rb.top - b.top + rb.height, r });
        };
        return html`<div role="listitem" key=${r.id}>
          <button
            type="button"
            class=${`bar-row${r.best ? ' best' : ''}`}
            onClick=${() => onPick?.(r)}
            onMouseMove=${(e) => {
              const b = box.current.getBoundingClientRect();
              setTip({ x: e.clientX - b.left, y: e.clientY - b.top, r });
            }}
            onMouseLeave=${() => setTip(null)}
            onFocus=${showTip}
            onBlur=${() => setTip(null)}
            aria-label=${`${r.label}: ${r.text}${r.basis ? ` (${r.basis} price)` : ''}${r.best ? ' (best)' : r.close ? ' (about the same as the best)' : ''}${r.sub ? `. ${r.sub}` : ''}`}
          >
            <div class="bar-label"><${StoreDot} id=${r.storeId} /><span class="nm">${r.label}</span></div>
            <div class="bar-track">
              <div class="bar-fill" style=${{ width: `calc((100% - 92px) * ${pctW / 100})` }}></div>
              <span class="bar-val">${r.text}</span>
              ${r.best && html`<span class="badge badge-good">Best</span>`}
              ${r.close && html`<span class="badge badge-outline" title="Within the difference between online and shelf prices, so not really dearer than the best">≈ same</span>`}
              ${r.basis && html`<span class="bar-basis muted small">${r.basis}</span>`}
            </div>
          </button>
        </div>`;
      })}
    </div>
    ${note && html`<div class="muted small" style=${{ marginTop: 8 }}>${note}</div>`}
    ${tip &&
    html`<div class="tip" style=${{ left: Math.min(Math.max(tip.x, 90), (box.current?.clientWidth || 300) - 90), top: tip.y }}>
      <div class="t-title">${tip.r.label}</div>
      ${tip.r.sub && html`<div class="ink2" style=${{ marginTop: 2 }}>${tip.r.sub}</div>`}
      <div class="t-row" style=${{ marginTop: 4 }}><span>Unit price</span><b>${tip.r.text}</b></div>
    </div>`}
  </div>`;
}

// ---------------- sparkline ----------------
export function Sparkline({ points, width = 132, height = 34, target, color = 'var(--bar-best)', label }) {
  if (!points || points.length < 1) return null;
  const pad = 5;
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs, target ?? Infinity);
  let hi = Math.max(...vs, target ?? -Infinity);
  if (hi - lo < 1e-9) {
    lo -= Math.abs(lo) * 0.1 || 1;
    hi += Math.abs(hi) * 0.1 || 1;
  }
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts, t0 + 1);
  const x = (t) => pad + ((t - t0) / (t1 - t0)) * (width - pad * 2);
  const y = (v) => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2);
  let d = '';
  points.forEach((p, i) => {
    const X = x(p.t);
    const Y = y(p.v);
    if (i === 0) d += `M${X},${Y}`;
    else d += `H${X}V${Y}`;
  });
  const last = points[points.length - 1];
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} role="img" aria-label=${label || 'Price trend'}>
    ${target != null && html`<line x1=${pad} x2=${width - pad} y1=${y(target)} y2=${y(target)} stroke="var(--good)" stroke-width="1" />`}
    <path d=${d} fill="none" stroke=${color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx=${x(last.t)} cy=${y(last.v)} r="4" fill=${color} stroke="var(--surface)" stroke-width="2" />
  </svg>`;
}

// ---------------- step line chart with hover ----------------
/**
 * series: [{ id, label, storeId?, color, points: [{ t, v, note? }] }]
 * formatY: v -> string
 */
export function LineChart({ series, height = 220, formatY = (v) => v.toFixed(2), target, targetLabel = 'Target', yTitle, minStep = 0 }) {
  const box = useRef();
  const width = useWidth(box);
  const [hover, setHover] = useState(null);
  const valid = series.filter((s) => s.points.length);
  const geo = useMemo(() => {
    const all = valid.flatMap((s) => s.points);
    if (!all.length) return null;
    let t0 = Math.min(...all.map((p) => p.t));
    let t1 = Math.max(...all.map((p) => p.t), Date.now());
    if (t1 - t0 < 3600e3) {
      t0 -= 12 * 3600e3;
      t1 += 12 * 3600e3;
    }
    let lo = Math.min(...all.map((p) => p.v), target ?? Infinity);
    let hi = Math.max(...all.map((p) => p.v), target ?? -Infinity);
    const padV = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
    // The domain is the labelled ticks themselves (see niceDomain): without that the axis stopped
    // below the data — an 8-point series spanning $2.99-$3.85 drew labels at $3.00 and $3.50 only,
    // leaving the peak in an unlabelled band with nothing to read it against.
    const scale = niceDomain(Math.max(0, lo - padV), hi + padV, { count: 4, minStep });
    lo = scale.lo;
    hi = scale.hi;
    const ticks = scale.ticks;
    const m = { l: 52, r: valid.length > 1 && valid.length <= 4 ? 86 : 14, t: 10, b: 26 };
    const iw = Math.max(40, width - m.l - m.r);
    const ih = height - m.t - m.b;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const days = (t1 - t0) / 86400e3;
    const nX = Math.max(2, Math.min(6, Math.floor(iw / 90)));
    const xticks = Array.from({ length: nX }, (_, i) => t0 + ((t1 - t0) * i) / (nX - 1));
    return { t0, t1, lo, hi, ticks, m, iw, ih, x, y, xticks, days };
  }, [series, width, height, target, minStep]);

  if (!geo) return html`<div class="muted small">No history yet.</div>`;
  const { m, x, y, ih, iw, ticks, xticks, t1 } = geo;

  const pathFor = (pts) => {
    let d = '';
    pts.forEach((p, i) => {
      const X = x(p.t);
      const Y = y(p.v);
      d += i === 0 ? `M${X},${Y}` : `H${X}V${Y}`;
    });
    if (pts.length) d += `H${x(t1)}`;
    return d;
  };
  const valueAt = (pts, t) => {
    let v = null;
    for (const p of pts) {
      if (p.t <= t + 1) v = p;
      else break;
    }
    return v;
  };

  // End labels only when they don't collide (legend always carries identity)
  let endLabels = null;
  if (valid.length > 1 && valid.length <= 4) {
    const ends = valid.map((s) => ({ s, y: y(s.points[s.points.length - 1].v) })).sort((a, b) => a.y - b.y);
    const collide = ends.some((e, i) => i > 0 && e.y - ends[i - 1].y < 13);
    if (!collide) endLabels = ends;
  }

  const onMove = (e) => {
    const b = box.current.getBoundingClientRect();
    const px = e.clientX - b.left;
    const t = geo.t0 + ((px - m.l) / iw) * (geo.t1 - geo.t0);
    if (px < m.l - 8 || px > m.l + iw + 8) return setHover(null);
    // snap to nearest observation time across series
    let best = null;
    for (const s of valid) for (const p of s.points) if (!best || Math.abs(p.t - t) < Math.abs(best - t)) best = p.t;
    setHover({ t: best ?? t, px: x(best ?? t) });
  };

  const hoverRows = hover
    ? valid
        .map((s) => ({ s, p: valueAt(s.points, hover.t) }))
        .filter((r) => r.p)
        .sort((a, b) => a.p.v - b.p.v)
    : [];

  return html`<div class="chart" ref=${box}>
    ${valid.length > 1 &&
    html`<div class="legend" style=${{ marginBottom: 6 }}>
      ${valid.map((s) => html`<span key=${s.id}><i style=${{ background: s.color }}></i>${s.label}</span>`)}
    </div>`}
    <svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} onMouseMove=${onMove} onMouseLeave=${() => setHover(null)} role="img" aria-label=${yTitle || 'Price history chart'}>
      <g class="grid">
        ${ticks.map((v) => html`<line key=${v} x1=${m.l} x2=${m.l + iw} y1=${y(v)} y2=${y(v)} />`)}
      </g>
      <g class="axis">
        ${ticks.map((v) => html`<text key=${v} x=${m.l - 8} y=${y(v) + 4} text-anchor="end">${formatY(v)}</text>`)}
        ${xticks.map((t, i) => html`<text key=${i} x=${x(t)} y=${m.t + ih + 18} text-anchor=${i === 0 ? 'start' : i === xticks.length - 1 ? 'end' : 'middle'}>${shortDate(t)}</text>`)}
      </g>
      <line class="baseline" x1=${m.l} x2=${m.l + iw} y1=${m.t + ih} y2=${m.t + ih} />
      ${target != null &&
      html`<g>
        <line x1=${m.l} x2=${m.l + iw} y1=${y(target)} y2=${y(target)} stroke="var(--good)" stroke-width="1" />
        <text x=${m.l + 4} y=${y(target) - 5} class="axis" style=${{ fill: 'var(--good-ink)' }}>${targetLabel} ${formatY(target)}</text>
      </g>`}
      ${valid.map(
        (s) => html`<g key=${s.id}>
          <path d=${pathFor(s.points)} fill="none" stroke=${s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          ${s.points.map((p, i) => html`<circle key=${i} cx=${x(p.t)} cy=${y(p.v)} r="4" fill=${s.color} stroke="var(--surface)" stroke-width="2" />`)}
        </g>`,
      )}
      ${endLabels &&
      endLabels.map((e) => html`<text key=${e.s.id} x=${m.l + iw + 8} y=${e.y + 4} class="axis" style=${{ fill: 'var(--ink-2)', fontWeight: 600 }}>${e.s.short || e.s.label}</text>`)}
      ${hover &&
      html`<line x1=${hover.px} x2=${hover.px} y1=${m.t} y2=${m.t + ih} stroke="var(--line-strong)" stroke-width="1" />`}
      ${hover && hoverRows.map((r) => html`<circle key=${r.s.id} cx=${hover.px} cy=${y(r.p.v)} r="5" fill=${r.s.color} stroke="var(--surface)" stroke-width="2" />`)}
    </svg>
    ${hover &&
    hoverRows.length > 0 &&
    html`<div class="tip" style=${{ left: Math.min(Math.max(hover.px, 90), width - 90), top: m.t + 10, transform: 'translate(-50%, 0)' }}>
      <div class="t-title">${new Date(hover.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      ${hoverRows.map(
        (r) => html`<div class="t-row" key=${r.s.id}>
          <span class="row" style=${{ gap: 6 }}><i style=${{ width: 10, height: 3, borderRadius: 2, background: r.s.color, display: 'inline-block' }}></i>${r.s.label}</span>
          <b>${formatY(r.p.v)}</b>
        </div>
        ${r.p.note && html`<div class="muted small">${r.p.note}</div>`}`,
      )}
    </div>`}
  </div>`;
}

/** Accessible table view of chart data */
export function DataTable({ series, formatY }) {
  const rows = series.flatMap((s) => s.points.map((p) => ({ label: s.label, t: p.t, v: p.v, note: p.note }))).sort((a, b) => b.t - a.t);
  return html`<details>
    <summary class="muted small" style=${{ cursor: 'pointer' }}>Show data table (${plural(rows.length, 'point')})</summary>
    <div class="mtable-wrap" style=${{ marginTop: 8, maxHeight: 240, overflow: 'auto' }}>
      <table class="mtable">
        <thead><tr><th>When</th>${series.length > 1 && html`<th>Series</th>`}<th>Price</th><th>Note</th></tr></thead>
        <tbody>
          ${rows.map(
            (r, i) => html`<tr key=${i}>
              <td>${new Date(r.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
              ${series.length > 1 && html`<td>${r.label}</td>`}
              <td>${formatY(r.v)}</td>
              <td>${r.note || ''}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  </details>`;
}
