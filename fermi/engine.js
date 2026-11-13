/* Pure Fermi engine: formula parsing, range samplers, Monte Carlo.
   Lifted verbatim from the inline script (same RNG call order, same seeds)
   so identical models keep giving identical numbers. */
import {mulberry32, gaussian, quantile} from '../assets/series.js';
import {SENS_N} from './seeds.js';

export const SUFFIX = {k: 1e3, m: 1e6, b: 1e9, t: 1e12};
export const Z90 = 1.6448536;

/* ---------- number formatting ---------- */
/* Round first, then pick the unit, so a value never prints across a boundary
   ("1000k", "1000M"). A huge value past 999T stays readable in digits, never an exponent. */
export function sig(x, n){
  const t = Number(x.toPrecision(n)).toString();
  const m = t.match(/^(-?)(\d)(?:\.(\d+))?e\+(\d+)$/);
  if(!m) return t;
  const digits = m[2] + (m[3] || ''), exp = Number(m[4]);
  return m[1] + digits + '0'.repeat(Math.max(0, exp + 1 - digits.length));
}
const UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
export function fmt(v){
  if(!isFinite(v)) return '—';
  if(v < 0) return '−' + fmt(-v);
  if(v === 0) return '0';
  if(v >= 1){
    const r = Number(v.toPrecision(3));
    for(const [m, s] of UNITS){
      if(r < m) continue;
      const u = Number((r / m).toPrecision(3));
      return (s === 'T' && u >= 1000 ? u.toLocaleString('en-GB') : String(u)) + s;
    }
    return String(r);
  }
  if(Number(v.toPrecision(2)) >= 0.001) return sig(v, 2);
  return v.toExponential(1);
}
/* A spread ratio (P90 / P10, or a factor): one printer on every surface. From x2 up it is
   two significant figures; below x2 it is the excess over 1 to two significant figures, so
   x1.05 and x1.029 are not both "x1" and a narrow spread is never doubled. */
export function ratioStr(r){
  if(!(r > 1) || r >= 2) return sig(r, 2);
  const e = Number((r - 1).toPrecision(2));
  return String(Number((1 + e).toFixed(12)));
}

/* One number grammar, shared by the formula box and the range boxes. Digits may be grouped
   by underscores, or by commas in threes (never a decimal comma); one decimal point, a
   trailing dot is fine. The range boxes also take a sign (ASCII or the page's own minus),
   an exponent (1e+6) and a one-letter magnitude suffix. */
const MANTISSA = /^(?:\d+(?:_\d+)*|\d{1,3}(?:,\d{3})+)?(?:\.(?:\d+(?:_\d+)*)?)?$/;
export function readMantissa(text){
  if(!/\d/.test(text) || !MANTISSA.test(text)) return NaN;
  return parseFloat(text.replace(/[,_]/g, ''));
}
export function readNumber(s){
  const m = String(s).trim().match(/^([-−]?)([\d.,_]+)(?:[eE]([-−+]?\d+))?\s*([kKmMbBtT])?$/);
  if(!m) return null;
  const base = readMantissa(m[2]);
  if(!isFinite(base)) return null;
  const num = m[3] ? parseFloat(m[2].replace(/[,_]/g, '') + 'e' + m[3].replace('−', '-')) : base;
  const suffix = m[4] || '';
  const value = (m[1] ? -1 : 1) * num * (SUFFIX[suffix.toLowerCase()] || 1);
  return isFinite(value) ? {value, suffix} : null;
}
export function parseNum(s){
  const r = readNumber(s);
  return r ? r.value : NaN;
}

/* ---------- tokenizer + parser ---------- */
export function tokenize(src){
  const toks = []; let i = 0;
  while(i < src.length){
    const c = src[i];
    if(/\s/.test(c)){ i++; continue; }
    if(/[0-9.]/.test(c)){
      let j = i;
      while(j < src.length && /[0-9._,]/.test(src[j])) j++;
      const mantissa = readMantissa(src.slice(i, j));
      if(!isFinite(mantissa)) throw {pos: i, msg: 'that number didn’t parse'};
      let suf = '';
      if(j < src.length && /[kKmMbBtT]/.test(src[j]) && !/[A-Za-z0-9_]/.test(src[j+1] || '')){ suf = src[j]; j++; }
      toks.push({t: 'num', v: mantissa * (SUFFIX[suf.toLowerCase()] || 1), pos: i, suf, text: src.slice(i, j)});
      i = j; continue;
    }
    if(/[A-Za-z_]/.test(c)){
      let j = i;
      while(j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({t: 'id', v: src.slice(i, j), pos: i});
      i = j; continue;
    }
    if(c === '×'){ toks.push({t: '*', pos: i}); i++; continue; }
    if(c === '÷'){ toks.push({t: '/', pos: i}); i++; continue; }
    if('+-*/^()'.includes(c)){ toks.push({t: c, pos: i}); i++; continue; }
    throw {pos: i, msg: `unexpected “${c}”`};
  }
  return toks;
}

export function parse(toks){
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  function expr(){
    let n = term();
    while(peek() && (peek().t === '+' || peek().t === '-')){
      const op = next().t; n = {t: 'bin', op, l: n, r: term()};
    }
    return n;
  }
  function term(){
    let n = unary();
    while(peek() && (peek().t === '*' || peek().t === '/')){
      const op = next().t; n = {t: 'bin', op, l: n, r: unary()};
    }
    return n;
  }
  function unary(){
    if(peek() && peek().t === '-'){ next(); return {t: 'neg', e: unary()}; }
    return power();
  }
  function power(){
    const b = primary();
    if(peek() && peek().t === '^'){ next(); return {t: 'bin', op: '^', l: b, r: unary()}; }
    return b;
  }
  function primary(){
    const tk = next();
    if(!tk) throw {msg: 'the expression ends early'};
    if(tk.t === 'num') return {t: 'num', v: tk.v};
    if(tk.t === 'id') return {t: 'var', name: tk.v};
    if(tk.t === '('){
      const n = expr();
      const c = next();
      if(!c || c.t !== ')') throw {msg: 'missing closing “)”'};
      return n;
    }
    throw {msg: `unexpected “${tk.t}”`};
  }
  const n = expr();
  if(p < toks.length){
    const tk = toks[p];
    throw {msg: `unexpected “${tk.t === 'id' ? tk.v : tk.t}” after the expression`};
  }
  return n;
}

export function collectVars(node, out){
  if(node.t === 'var'){ if(!out.includes(node.name)) out.push(node.name); }
  else if(node.t === 'neg') collectVars(node.e, out);
  else if(node.t === 'bin'){ collectVars(node.l, out); collectVars(node.r, out); }
  return out;
}

export function evalNode(n, env){
  switch(n.t){
    case 'num': return n.v;
    case 'var': return env[n.name];
    case 'neg': return -evalNode(n.e, env);
    case 'bin': {
      const a = evalNode(n.l, env), b = evalNode(n.r, env);
      switch(n.op){
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return Math.pow(a, b);
      }
    }
  }
}

/* ---------- range samplers ---------- */
export function effDist(d, lo){
  if(!d || d === 'auto') return lo > 0 ? 'logn' : 'norm';
  if(d === 'logn' && lo <= 0) return 'norm';
  return d;
}
export function distMedian(lo, hi, d){
  if(effDist(d, Math.min(lo, hi)) !== 'logn') return (lo + hi) / 2;
  const p = lo * hi;
  /* sqrt(lo*hi) while the product is an ordinary number; in logs when it would overflow or
     underflow (ranges around 1e160 or 1e-250), so the median never becomes Infinity or 0 */
  return isFinite(p) && p > 1e-290 ? Math.sqrt(p) : Math.exp((Math.log(lo) + Math.log(hi)) / 2);
}
export function samplerFor(lo, hi, dist, rand, gauss){   /* shared with cashflow.js */
  if(lo > hi){ const t = lo; lo = hi; hi = t; }
  if(lo === hi) return () => lo;
  const d = effDist(dist, lo);
  if(d === 'uni') return () => lo + (hi - lo) * rand();
  if(d === 'logn'){
    const mu = (Math.log(lo) + Math.log(hi)) / 2;
    const sg = (Math.log(hi) - Math.log(lo)) / (2 * Z90);
    return () => Math.exp(mu + sg * gauss());
  }
  const mu = (lo + hi) / 2, sg = (hi - lo) / (2 * Z90);
  return () => mu + sg * gauss();
}

/* inverse standard-normal CDF (Acklam's rational approximation) — enough
   precision for closed-form sizing quantiles; returns exactly 0 at p=0.5. */
export function probit(p){
  if(p <= 0) return -Infinity;
  if(p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if(p < pl){ q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if(p <= ph){ q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

/* closed-form q-quantile of a period range. logn/norm: the lo..hi range is a
   90% CI (its edges sit at ±Z90 sigma); uni: lo..hi is the full support
   (matching samplerFor). Deterministic — never touches the RNG. */
export function distQuantile(lo, hi, dist, q){
  if(lo > hi){ const t = lo; lo = hi; hi = t; }
  if(lo === hi) return lo;
  const d = effDist(dist, lo);
  if(d === 'uni') return lo + (hi - lo) * q;
  const z = probit(q) / Z90;                 // edges of lo..hi are at ±Z90
  if(d === 'logn'){
    const mu = (Math.log(lo) + Math.log(hi)) / 2, hw = (Math.log(hi) - Math.log(lo)) / 2;
    return Math.exp(mu + z * hw);
  }
  const mu = (lo + hi) / 2, hw = (hi - lo) / 2;
  return mu + z * hw;
}

/* IRR of one sampled flow vector: the rate at which NPV(r) changes sign, looked for from
   -99.9% to +100,000% (flows at period end, t0 undiscounted). Exactly one sign change gives
   the IRR; none, or several (two real roots, three...), gives no IRR, which the callers count
   in their "undefined" share. Shared by cashflow.js and debt.js.
   Descartes: a flow vector with no sign change has no root at all; with exactly one it has
   exactly one, so a bracket test over the window is exact (the common case, and the same
   bisection the old routine used). Only a vector with several sign changes needs a scan. */
const IRR_LO = -0.999, IRR_HI = 1000, IRR_SCAN = 300;
export function irrOf(flows, horizon){
  let changes = 0, prev = 0;
  for(let t = 0; t <= horizon; t++){
    const sg = flows[t] > 0 ? 1 : flows[t] < 0 ? -1 : 0;
    if(sg){ if(prev && sg !== prev) changes++; prev = sg; }
  }
  if(changes === 0) return null;
  const f = r => {
    const dd = 1 / (1 + r);
    let acc = 0;
    for(let t = horizon; t >= 0; t--) acc = acc * dd + flows[t];
    return acc;
  };
  const bisect = (lo, hi, flo) => {
    for(let i = 0; i < 90 && hi - lo > 1e-15 * (1 + Math.abs(lo)); i++){
      const m = (lo + hi) / 2, fm = f(m);
      if(fm === 0) return m;
      if(flo * fm < 0) hi = m; else { lo = m; flo = fm; }
    }
    return (lo + hi) / 2;
  };
  if(changes === 1){
    const flo = f(IRR_LO), fhi = f(IRR_HI);
    if(!(isFinite(flo) && isFinite(fhi)) || flo * fhi > 0) return null;
    return bisect(IRR_LO, IRR_HI, flo);
  }
  const xlo = Math.log(1 + IRR_LO), xhi = Math.log(1 + IRR_HI);
  let rPrev = IRR_LO, fPrev = f(rPrev), found = null, flips = 0;
  if(!isFinite(fPrev)) return null;
  for(let i = 1; i <= IRR_SCAN; i++){
    const r = i === IRR_SCAN ? IRR_HI : Math.exp(xlo + (xhi - xlo) * i / IRR_SCAN) - 1, fr = f(r);
    if(!isFinite(fr)) return null;
    if((fPrev < 0) !== (fr < 0)){ if(++flips > 1) return null; found = [rPrev, r, fPrev]; }
    rPrev = r; fPrev = fr;
  }
  return flips === 1 ? bisect(found[0], found[1], found[2]) : null;
}

/* One Monte Carlo run over a parsed model; reseeded per call so identical
   models always give identical numbers. Optionally pins one variable. */
export function simulateModel({ast, varNames, ranges, dists}, {seed, n, pinName = null, pinValue = 0}){
  const rand = mulberry32(seed);
  const gauss = gaussian(rand);
  const samplers = Object.create(null);          // no prototype: a variable may be called __proto__
  for(const name of varNames){
    samplers[name] = samplerFor(ranges[name][0], ranges[name][1], dists[name], rand, gauss);
  }
  let out = [];
  const env = Object.create(null);
  for(let i = 0; i < n; i++){
    for(const name of varNames) env[name] = (name === pinName) ? pinValue : samplers[name]();
    const v = evalNode(ast, env);
    if(isFinite(v)) out.push(v);
  }
  const raw = out.slice();
  out = Float64Array.from(out).sort();
  return {raw, sorted: out};
}

/* ---------- exact answers for product-type formulas ---------- */
export const Z80 = 1.2815515655446004;           // Φ⁻¹(0.90): P10 and P90 sit at ∓Z80 sigma

/* The normal curve, to double precision (error below 1e-13). A Taylor series for the body, the
   Lentz continued fraction beyond (the same pair timeline/mergebias.js uses; copied, not imported
   across tools). Q(x) = P(Z > x) for x >= 0. */
function bodyQ(x){
  let term = x, sum = x;
  for(let n = 1; n < 200 && Math.abs(term) > 1e-18; n++){ term *= x * x / (2 * n + 1); sum += term; }
  return 0.5 - Math.exp(-x * x / 2) / Math.SQRT2 / Math.sqrt(Math.PI) * sum;
}
function tailQ(x){
  const K = x < 3 ? 400 : x < 6 ? 120 : 40;
  let f = 0; for(let k = K; k >= 1; k--) f = k / (x + f);
  return Math.exp(-x * x / 2 - 0.5 * Math.log(2 * Math.PI)) / (x + f);
}
export function normCdf(z){
  if(Number.isNaN(z)) return NaN;
  const x = Math.abs(z), q = x < 2 ? bodyQ(x) : tailQ(x);
  return z < 0 ? q : 1 - q;
}
/* 1 − Φ(z), without losing the small tail to subtraction */
export function normSurvival(z){ return normCdf(-z); }

/* When the answer is exactly log-normal: log(answer) = ln c + Σ e_k·ln x_k, every varying input
   log-normal with its range as the 90% interval, so mu and sigma are sums. Returns
   {mu, sigma, terms: [{name, e, sigma}]} (sigma² = Σ (e_k·sigma_k)²) or null whenever that cannot
   be shown: a sum or difference with a varying input, an input in an exponent, a normal or
   uniform input, a non-positive or non-finite constant factor, nothing varying, a median that is
   zero or not finite, or any construct not proved log-linear. */
export function exactLogNormal({ast, varNames, ranges, dists}){
  const info = Object.create(null);
  for(const name of varNames){
    const r = ranges[name];
    if(!r || !isFinite(r[0]) || !isFinite(r[1])) return null;
    const lo = Math.min(r[0], r[1]), hi = Math.max(r[0], r[1]);
    if(lo === hi){ info[name] = {point: lo}; continue; }
    if(effDist(dists && dists[name], lo) !== 'logn') return null;
    info[name] = {mu: (Math.log(lo) + Math.log(hi)) / 2, sigma: (Math.log(hi) - Math.log(lo)) / (2 * Z90)};
  }
  /* a node is {v} (a constant) or {lc, e} (a positive constant factor exp(lc) times the product of
     x^e over the Map e of name -> exponent); null means "not provable" */
  const logOf = v => (v > 0 && isFinite(v)) ? Math.log(v) : null;
  const scale = (e, k) => new Map([...e].map(([m, p]) => [m, p * k]));
  function walk(n){
    if(n.t === 'num') return {v: n.v};
    if(n.t === 'var'){
      const i = info[n.name];
      return i.point !== undefined ? {v: i.point} : {lc: 0, e: new Map([[n.name, 1]])};
    }
    if(n.t === 'neg'){ const a = walk(n.e); return a && a.v !== undefined ? {v: -a.v} : null; }
    if(n.t !== 'bin') return null;
    const a = walk(n.l), b = walk(n.r);
    if(!a || !b) return null;
    const ca = a.v !== undefined, cb = b.v !== undefined;
    if(ca && cb) return {v: evalNode({t: 'bin', op: n.op, l: {t: 'num', v: a.v}, r: {t: 'num', v: b.v}}, {})};
    if(n.op === '^'){
      if(ca || !isFinite(b.v)) return null;                          // an input in the exponent is not log-linear
      return {lc: a.lc * b.v, e: scale(a.e, b.v)};
    }
    if(n.op !== '*' && n.op !== '/') return null;                    // + or − with a varying input
    const div = n.op === '/';
    if(ca || cb){
      const k = logOf(ca ? a.v : b.v);
      if(k === null) return null;
      if(ca) return div ? {lc: k - b.lc, e: scale(b.e, -1)} : {lc: k + b.lc, e: b.e};
      return {lc: div ? a.lc - k : a.lc + k, e: a.e};
    }
    const e = new Map(a.e);
    for(const [m, p] of b.e) e.set(m, (e.get(m) || 0) + (div ? -p : p));
    return {lc: div ? a.lc - b.lc : a.lc + b.lc, e};
  }
  const w = walk(ast);
  if(!w || w.v !== undefined) return null;
  let mu = w.lc, v = 0;
  const terms = [];
  for(const name of varNames){
    const i = info[name];
    if(i.point !== undefined) continue;
    const e = w.e.get(name) || 0;
    mu += e * i.mu;
    v += (e * i.sigma) ** 2;
    terms.push({name, e, sigma: i.sigma});
  }
  const sigma = Math.sqrt(v), median = Math.exp(mu);
  if(!(sigma > 0) || !isFinite(sigma) || !isFinite(mu) || !(median > 0) || !isFinite(median)) return null;
  return {mu, sigma, terms};
}

/* One simulate-then-summarise for the page, both Markdown exports, the PNG, copy-summary, compare,
   the threshold readout and the goldens. The draws are exactly simulateModel's (the histogram,
   the hover and the pour keep them); the headline percentiles come from the closed form when the
   answer is exactly log-normal and from the sample otherwise. */
export function summariseEstimate(model, {seed, n}){
  const {raw, sorted} = simulateModel(model, {seed, n});
  const exact = exactLogNormal(model);
  const q = (p, z) => exact ? Math.exp(exact.mu + z * exact.sigma) : sorted.length ? quantile(sorted, p) : NaN;
  return {raw, sorted, exact, p10: q(.1, -Z80), p50: q(.5, 0), p90: q(.9, Z80)};
}
/* share of runs above t, over ALL runs (sorted ascending) */
export function shareAbove(sorted, t){
  let lo = 0, hi = sorted.length;
  while(lo < hi){ const m = (lo + hi) >> 1; if(sorted[m] <= t) lo = m + 1; else hi = m; }
  return sorted.length ? (sorted.length - lo) / sorted.length : 0;
}
/* P(answer > t): closed form when exact (a value at or below zero is always exceeded), else counted */
export function probAbove(s, t){
  if(!s.exact) return shareAbove(s.sorted, t);
  if(!(t > 0)) return 1;
  return normSurvival((Math.log(t) - s.exact.mu) / s.exact.sigma);
}
/* P(B > A) for independently sampled variants: closed form when both are exact, else counted over
   the paired draws */
export function probExceeds(B, A){
  if(A.exact && B.exact)
    return normCdf((B.exact.mu - A.exact.mu) / Math.sqrt(A.exact.sigma ** 2 + B.exact.sigma ** 2));
  const n = Math.min(A.raw.length, B.raw.length);
  if(!n) return null;
  let c = 0;
  for(let i = 0; i < n; i++) if(B.raw[i] > A.raw[i]) c++;
  return c / n;
}

/* Sensitivity as value of information (moved verbatim from the inline lint()):
   pin each variable at its median, remeasure the spread — "what would knowing
   this exactly buy you?" Same call order and seeds as the app has always used. */
export function computeSensitivity(model, {seed, np = SENS_N, p10, p90}){
  const {varNames, ranges, dists} = model;
  const posSpread = p10 > 0;
  const fullRatio = posSpread ? p90 / p10 : NaN;
  const fullRange = p90 - p10;
  const sens = [], unmeasured = [];
  for(const name of varNames){
    const [lo, hi] = ranges[name];
    if(lo === hi) continue;
    const pinned = simulateModel(model,
      {seed, n: np, pinName: name, pinValue: distMedian(lo, hi, dists[name])}).sorted;
    if(pinned.length < np * 0.3){ unmeasured.push(name); continue; }
    const q10 = quantile(pinned, .10), q90 = quantile(pinned, .90);
    let share, label;
    if(posSpread && q10 > 0 && fullRatio > 1.0001){
      share = 1 - Math.log(Math.max(q90 / q10, 1.0001)) / Math.log(fullRatio);
      label = '×' + ratioStr(q90 / q10);
    } else {
      share = fullRange > 0 ? 1 - (q90 - q10) / fullRange : 0;
      label = fmt(q10) + ' – ' + fmt(q90);
    }
    sens.push({name, share: Math.max(0, Math.min(1, share)), label});
  }
  sens.sort((a, b) => b.share - a.share);
  return {sens, fullRatio, unmeasured};
}

/* Replay the seeded MC run and decompose each finite draw into telescoping pin-paths
   for the "Replay the maths" pour. A SEPARATE replay (own mulberry32+gaussian, the
   SAME sampler construction and per-iteration `for name of varNames` order as
   simulateModel) — so the RNG sequence is bit-identical and NO RNG call is added to any
   existing path (fermi's RNG-order compat contract). steps[i] = the value with
   order[0..i] at that draw's SAMPLED values and the rest at medians, so steps[k-1] === y
   (telescoping — exact for any AST, incl / and cross-terms). `order` (the sens ranking)
   is completed internally with any varying var it dropped. `dropped` is raw — the POUR,
   which knows the axis, decides the ≤0-under-log drop. Returns first `g` finite+clean draws. */
export function traceDraws({ast, varNames, ranges, dists}, {seed, g, order}){
  const medians = Object.create(null);
  for(const n of varNames){ const [lo, hi] = ranges[n];
    medians[n] = lo === hi ? lo : distMedian(lo, hi, dists[n]); }   // lo===hi exact (avoids sqrt overflow)
  const base = evalNode(ast, medians);
  const varying = varNames.filter(n => ranges[n][0] !== ranges[n][1]);
  const seen = new Set(order);
  const full = [...order.filter(n => varying.includes(n)), ...varying.filter(n => !seen.has(n))];
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const samplers = Object.create(null);
  for(const n of varNames) samplers[n] = samplerFor(ranges[n][0], ranges[n][1], dists[n], rand, gauss);
  const draws = []; let dropped = 0;
  for(let it = 0; it < g * 40 && draws.length < g; it++){          // BOUNDED — a degenerate model can't hang
    const sampled = Object.create(null);
    for(const n of varNames) sampled[n] = samplers[n]();           // SAME per-iteration order as simulateModel
    const y = evalNode(ast, sampled);
    if(!isFinite(y)) continue;                                     // match simulateModel's raw filter
    const steps = []; const cur = Object.assign(Object.create(null), medians); let bad = false;
    for(const n of full){ cur[n] = sampled[n]; const x = evalNode(ast, cur);
      if(!isFinite(x)) bad = true; steps.push(x); }
    if(bad){ dropped++; continue; }                                // a non-finite intermediate step
    draws.push({y, steps});
  }
  const ok = isFinite(base) && draws.length > 0;
  return {base, order: full, draws, dropped, ok};
}
