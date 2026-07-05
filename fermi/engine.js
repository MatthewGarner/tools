/* Pure Fermi engine: formula parsing, range samplers, Monte Carlo.
   Lifted verbatim from the inline script (same RNG call order, same seeds)
   so identical models keep giving identical numbers. */
import {mulberry32, gaussian} from '../assets/series.js';

export const SUFFIX = {k: 1e3, m: 1e6, b: 1e9, t: 1e12};
export const Z90 = 1.6448536;

export function parseNum(s){
  s = String(s).trim().replace(/,/g, '');
  const m = s.match(/^(-?\d*\.?\d+(?:e-?\d+)?)\s*([kKmMbBtT])?$/);
  if(!m) return NaN;
  return parseFloat(m[1]) * (SUFFIX[(m[2] || '').toLowerCase()] || 1);
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
      let suf = '';
      if(j < src.length && /[kKmMbBtT]/.test(src[j]) && !/[A-Za-z0-9_]/.test(src[j+1] || '')){ suf = src[j]; j++; }
      const num = parseFloat(src.slice(i, j).replace(/[,_]/g, ''));
      if(!isFinite(num)) throw {pos: i, msg: 'that number didn’t parse'};
      toks.push({t: 'num', v: num * (SUFFIX[suf.toLowerCase()] || 1), pos: i});
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
  return effDist(d, Math.min(lo, hi)) === 'logn' ? Math.sqrt(lo * hi) : (lo + hi) / 2;
}
function samplerFor(lo, hi, dist, rand, gauss){
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

/* One Monte Carlo run over a parsed model; reseeded per call so identical
   models always give identical numbers. Optionally pins one variable. */
export function simulateModel({ast, varNames, ranges, dists}, {seed, n, pinName = null, pinValue = 0}){
  const rand = mulberry32(seed);
  const gauss = gaussian(rand);
  const samplers = {};
  for(const name of varNames){
    samplers[name] = samplerFor(ranges[name][0], ranges[name][1], dists[name], rand, gauss);
  }
  const out = [];
  const env = {};
  for(let i = 0; i < n; i++){
    for(const name of varNames) env[name] = (name === pinName) ? pinValue : samplers[name]();
    const v = evalNode(ast, env);
    if(isFinite(v)) out.push(v);
  }
  const raw = out.slice();
  out.sort((a, b) => a - b);
  return {raw, sorted: out};
}
