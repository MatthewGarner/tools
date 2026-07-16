/* "Replay the maths" — the Galton pour. Canvas overlay animation + the pure, tested
   verdict. The pour pours the traceDraws grains from the all-medians spout through the
   ranked-driver rows into the existing histogram ("the pile IS the histogram"), then
   leaves a quotable verdict. Canvas + a DOM verdict — no SVG (not a render*.js file). */

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };

/* Which ranked row widens the pile most (IQR of its cumulative column), or the
   flat-model fallback. Widenings telescope (Σ === totalIqr), so "flat" is measured
   top-vs-RUNNER-UP, never top-vs-total (which can't fire for ≤3 rows). */
export function pourVerdict(trace, {names}){
  const {order, draws} = trace;
  if(!draws.length) return {text: '', topName: null};
  const iqrAt = i => { const col = draws.map(d => d.steps[i]); return q(col, .75) - q(col, .25); };
  const prev = i => i === 0 ? 0 : iqrAt(i - 1);        // the spout column is all-at-base → IQR 0 (honest)
  const widen = order.map((n, i) => ({n, w: iqrAt(i) - prev(i)}));
  const totalIqr = iqrAt(order.length - 1) || 1;
  const [t1, t2] = widen.slice().sort((a, b) => b.w - a.w);
  const nm = n => (names[n] || n).replace(/_/g, ' ');
  if(!t2 || (t1.w - t2.w) / totalIqr < 0.15)
    return {text: 'No single input dominates — the spread is shared across the drivers.', topName: null};
  return {text: 'Most of the spread is born at ' + nm(t1.n) + ' — the pile widens most as it crosses that row.', topName: t1.n};
}

/* The pour animation. A transient overlay canvas over the histogram area (a taller panel:
   a single spout at the point-estimate → the ranked-driver rows → the pile) that plays, then
   fades out revealing the real #hist (same distribution, by construction). pointer-events:none;
   sized per play(); removed on settle. Reduced-motion → the settled end-state instantly.
   Honesty: each grain's x after row i is layout.px(trace.draws[j].steps[i]) — the telescoped
   truth; the ≤0-under-log / off-axis drop is handled here (the caller re-layouts forceLinear). */
export function mountPour(histCanvas, wrapEl){
  let raf = 0, overlay = null, octx = null, timers = [];
  function teardown(){
    for(const t of timers) clearTimeout(t); timers = [];
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    if(overlay){ overlay.remove(); overlay = null; octx = null; }
  }
  function play(trace, layout, rows, colors, {reduced = false} = {}){
    teardown();
    const cw = histCanvas.clientWidth, histH = histCanvas.clientHeight || 180;
    const padT = 26, padB = 20, plotH = histH - padT - padB;
    const H = 360;                                   // the pour panel is taller than #hist
    const dpr = window.devicePixelRatio || 1;
    overlay = document.createElement('canvas');
    // extend UPWARD so the pour's histogram is pixel-aligned with #hist (bottom edges match)
    // → "the pile IS the histogram" literally, and the settle-fade is seamless (no jump).
    overlay.style.cssText = 'position:absolute;left:0;top:' + (-(H - histH)) + 'px;pointer-events:none;z-index:6;';
    const tip = wrapEl.querySelector('#tip');
    if(tip) wrapEl.insertBefore(overlay, tip); else wrapEl.appendChild(overlay);
    octx = overlay.getContext('2d');
    overlay.width = Math.round(cw * dpr); overlay.height = Math.round(H * dpr);
    overlay.style.width = cw + 'px'; overlay.style.height = H + 'px';
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const C = colors, NB = layout.NB, bins = layout.bins;
    const X = v => layout.px(v);
    const spoutX = X(trace.base), spoutY = 26;
    const baseline = H - padB, barsH = plotH, barsTop = baseline - barsH;   // aligned with #hist bars
    const k = trace.order.length;
    const bandTop = 58, bandBot = barsTop - 16;
    const rowY = i => bandTop + (bandBot - bandTop) * (i + 0.5) / Math.max(1, k);
    const dom = trace.order[0];

    // per-grain x sequence [spout, afterRow0..afterRow(k-1)=final]; drop off-axis / ≤0-log grains
    const grains = [];
    for(const d of trace.draws){
      if(d.y < layout.lo || d.y > layout.hi) continue;
      if(layout.useLog && d.steps.some(x => x <= 0)) continue;
      grains.push({xs: [spoutX, ...d.steps.map(X)], fin: X(d.y), t: 0, done: false});
    }
    const settled = new Int32Array(NB);
    const binOf = x => Math.max(0, Math.min(NB - 1, Math.floor(x / (cw / NB))));

    function backdrop(alpha){
      octx.clearRect(0, 0, cw, H);
      octx.globalAlpha = alpha; octx.fillStyle = C.card;
      octx.fillRect(0, 0, cw, H); octx.globalAlpha = 1;
      octx.strokeStyle = C.line; octx.lineWidth = 1; octx.strokeRect(0.5, 0.5, cw - 1, H - 1);
      // spout
      octx.fillStyle = C.faint; octx.font = '11px ui-monospace,monospace'; octx.textAlign = 'center';
      octx.fillText('one number — the point estimate', spoutX, spoutY - 8);
      octx.fillStyle = C.ink; octx.globalAlpha = 0.5; octx.fillRect(spoutX - 14, spoutY - 3, 28, 3); octx.globalAlpha = 1;
      // row labels + faint bands
      trace.order.forEach((n, i) => { const isD = n === dom, y = rowY(i);
        if(isD){ octx.fillStyle = C.accent; octx.globalAlpha = 0.10; octx.fillRect(6, y - 15, cw - 12, 30); octx.globalAlpha = 1; }
        octx.fillStyle = isD ? C.ink : C.muted; octx.font = (isD ? '600 ' : '') + '12px system-ui'; octx.textAlign = 'left';
        octx.fillText(n.replace(/_/g, ' '), 12, y - 3);
        octx.fillStyle = isD ? C.accent : C.faint; octx.font = '11px system-ui'; octx.textAlign = 'right';
        octx.fillText(Math.round((rows[i] ? rows[i].share : 0) * 100) + '%', cw - 12, y - 3);
      });
      // the pile so far
      const cmax = Math.max(1, ...settled);
      octx.fillStyle = C.accent; octx.globalAlpha = 0.9;
      for(let b = 0; b < NB; b++){ const h = settled[b] / cmax * barsH; if(h < 0.5) continue;
        octx.fillRect(bins[b].x + 1, baseline - h, Math.max(1, bins[b].w - 2), h); }
      octx.globalAlpha = 1;
    }

    if(reduced){                                    // end-state instantly
      for(const g of grains) settled[binOf(g.fin)]++;
      backdrop(1);
      timers.push(setTimeout(() => fade(), 3600));
      return;
    }
    // animate
    let landed = 0; const total = grains.length; let spawned = 0; const spawnRate = Math.ceil(total / 68);
    const fallY = (bandTop - spoutY), rowSpan = (bandBot - bandTop) / Math.max(1, k - 0.001);
    function frame(){
      spawned = Math.min(total, spawned + spawnRate);
      backdrop(1);
      octx.fillStyle = C.accent; octx.globalAlpha = 0.7;
      for(let i = 0; i < spawned; i++){
        const g = grains[i]; if(g.done) continue;
        g.t += 0.021;
        // y from spout down to baseline over t in [0,1]
        const yy = spoutY + (baseline - spoutY) * Math.min(1, g.t);
        // x: interpolate through the row stations as y crosses each rowY
        let x = g.xs[0];
        for(let r = 0; r < k; r++){ const ry = rowY(r);
          if(yy >= ry) x = g.xs[r + 1];
          else if(yy >= ry - rowSpan){ const f = (yy - (ry - rowSpan)) / rowSpan; x = g.xs[r] + (g.xs[r + 1] - g.xs[r]) * f; break; }
          else break;
        }
        if(g.t >= 1){ g.done = true; settled[binOf(g.fin)]++; landed++; continue; }
        octx.fillRect(x - 1.3, yy - 1.3, 2.7, 2.7);
      }
      octx.globalAlpha = 1;
      if(landed >= total){ timers.push(setTimeout(() => fade(), 2600)); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function fade(){
      let a = 1; const step = () => { a -= 0.06; if(a <= 0){ teardown(); return; }
        overlay.style.opacity = a; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }
  }
  return {play, stop: teardown};
}
