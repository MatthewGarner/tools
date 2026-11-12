/* Pure verdict primitives shared by browser chrome and versioned model views. */
/* ---------- pure ---------- */

/* Split `line` into runs around the FIRST occurrence of `fig`, the one
   load-bearing number the page exists to produce. Returns
   [{t, fig:boolean}, …]; an absent/empty figure yields a single plain run. */
export function markFigure(line, fig){
  const s = String(line ?? '');
  if(!s) return [];
  const f = String(fig ?? '');
  const at = f ? s.indexOf(f) : -1;
  if(at < 0) return [{t: s, fig: false}];
  const out = [];
  if(at > 0) out.push({t: s.slice(0, at), fig: false});
  out.push({t: f, fig: true});
  const tail = s.slice(at + f.length);
  if(tail) out.push({t: tail, fig: false});
  return out;
}

/* The counts segment: values joined by " · ", empties dropped. */
export function countsLine(counts){
  return (Array.isArray(counts) ? counts : [counts])
    .filter(c => c != null && String(c).trim() !== '')
    .map(c => String(c).trim())
    .join(' · ');
}

/* ---------- authored verdicts (2026-07-31) ----------
   `verdict:` gives the author three states — absent (the tool's line, unchanged),
   `off` (no verdict anywhere), or their own text. The semantics live here, once,
   so every parser can stay dumb: store the raw string, let this decide. */

/* The first numeric token, with any currency prefix and %/k/M suffix attached.
   An authored line keeps the house anatomy — ONE brand figure — without the tool
   having to know what the author's sentence is about. A bare year counts (Matt's
   call, 2026-07-31): a 1900–2100 exemption is a rule nobody could predict, and it
   would misfire on a real figure that lands in the range. */
export function firstFigure(text){
  const s = String(text ?? '');
  const re = /[-−]?[£$€]?\d[\d,]*(?:\.\d+)?%?[kKmMbB]?/g;
  for(let m; (m = re.exec(s)); ){
    let t = m[0], at = m.index;
    /* a leading -/− only reads as a minus after a boundary: in "top-3" the
       hyphen belongs to the word, so the figure is the bare 3 */
    if(/[-−]/.test(t[0]) && at && /[\w£$€]/.test(s[at - 1])){ t = t.slice(1); at += 1; }
    /* a digit inside a token ("v2", "Q3") is spelling, not a figure — reddening
       the 2 of "v2" mid-word is exactly the misfire this boundary prevents */
    if(at && /[A-Za-z0-9_]/.test(s[at - 1])) continue;
    return t;
  }
  return '';
}

/* (authored, auto) → {line, fig}. `authored` is the raw `verdict:` value, or
   null/undefined when the key is absent. Note the deliberate asymmetry: an
   ABSENT key means "the tool decides", but a PRESENT-but-empty one means the
   author cleared it — deleting the text must not resurrect the auto line. */
export function resolveVerdict(authored, auto){
  if(authored == null) return auto;
  const s = String(authored).trim();
  if(!s || s.toLowerCase() === 'off') return {line: '', fig: ''};
  return {line: s, fig: firstFigure(s)};
}

