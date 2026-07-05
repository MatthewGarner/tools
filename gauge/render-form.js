/* Session model → participant form HTML string, and DOM-free value collection. */
import {esc} from '../assets/svg.js';

export function renderForm(model, opts = {}){
  const editable = !!opts.editable;   // compose preview only — participants never see these
  const qs = model.questions.map((q, i) => {
    const del = editable
      ? '<button class="qdel" data-line="' + q.srcLine + '" aria-label="Remove question ' + (i + 1) + '">×</button>'
      : '';
    const head = '<p class="qtext"><span class="qnum">' + (i + 1) + '</span>' + esc(q.text) + del + '</p>';
    if(q.type === 'prob'){
      return '<div class="q" data-q="' + i + '" data-type="prob">' + head +
        '<div class="probrow">' +
        '<input type="range" min="0" max="100" step="1" value="50" data-part="prob" data-touched="0"' +
        ' aria-label="Probability for: ' + esc(q.text) + '">' +
        '<output class="probout">—</output></div>' +
        '<div class="anchors" aria-hidden="true"><span>5% — very unlikely</span>' +
        '<span>50% — toss-up</span><span>95% — very likely</span></div></div>';
    }
    const unit = q.unit ? '<span class="unit">' + esc(q.unit) + '</span>' : '';
    return '<div class="q" data-q="' + i + '" data-type="range">' + head +
      '<div class="rangerow">' +
      '<input type="number" inputmode="decimal" data-part="low" aria-label="Low end for: ' + esc(q.text) + '">' +
      '<span class="to">to</span>' +
      '<input type="number" inputmode="decimal" data-part="high" aria-label="High end for: ' + esc(q.text) + '">' +
      unit + '</div>' +
      '<p class="hint">Your 90% range — you’d be surprised if the truth fell outside it.</p>' +
      '<p class="qerr" hidden></p></div>';
  });
  const name = model.names
    ? '<div class="q namefield"><label>Your name ' +
      '<input type="text" maxlength="40" data-name placeholder="shown next to your answers"></label></div>'
    : '';
  const add = editable
    ? '<button class="addq">＋ Add question</button>'
    : '';
  return '<div class="gform">' + qs.join('') + name + add + '</div>';
}

export function collectValues(model, fields){
  const values = model.questions.map(() => null);
  const errors = [];
  const find = (q, part) => fields.find(f => f.q === q && f.part === part);
  model.questions.forEach((q, i) => {
    if(q.type === 'prob'){
      const f = find(i, 'prob');
      if(f && f.touched) values[i] = Math.min(100, Math.max(0, +f.value || 0));
      return;
    }
    const lo = find(i, 'low'), hi = find(i, 'high');
    const loS = lo ? lo.value.trim() : '', hiS = hi ? hi.value.trim() : '';
    if(!loS && !hiS) return;
    if(!loS || !hiS){ errors.push({q: i, msg: 'fill both ends of the range (or neither)'}); return; }
    const loV = +loS, hiV = +hiS;
    if(!isFinite(loV) || !isFinite(hiV)){ errors.push({q: i, msg: 'numbers only'}); return; }
    if(loV > hiV){ errors.push({q: i, msg: 'the low end is above the high end'}); return; }
    values[i] = [loV, hiV];
  });
  return {values, errors, answered: values.filter(v => v !== null).length};
}
