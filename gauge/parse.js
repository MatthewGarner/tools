/* /gauge DSL → session model. No DOM. */
import {PALETTE_NAMES} from '../assets/series.js';

export const MAX_QUESTIONS = 20;

export function parse(text){
  const model = {title: '', names: false, palette: 'ocean', accent: null, questions: [], warnings: []};
  const lines = text.split(/\r?\n/);
  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    const warn = msg => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

    const config = line.match(/^(title|names|palette|accent)\s*:\s*(.*)$/i);
    if(config){
      if(model.questions.length){ warn('config keys go before the first question — ignored'); continue; }
      const key = config[1].toLowerCase(), val = config[2].trim();
      if(key === 'title') model.title = val;
      else if(key === 'names'){
        const v = val.toLowerCase();
        if(v === 'on' || v === 'off') model.names = v === 'on';
        else warn('names wants on or off');
      }
      else if(key === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else warn('unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      }
      else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else warn('accent wants a 6-digit hex like #C05621');
      }
      continue;
    }

    const m = line.match(/^(.*?)\s*::\s*(.+)$/);
    if(!m){ warn('not a question — write "<text> :: prob" or "<text> :: range <unit>"'); continue; }
    const qtext = m[1].trim(), kind = m[2].trim();
    if(!qtext){ warn('missing question text before "::"'); continue; }

    let q = null;
    const rangeM = kind.match(/^range(?:\s+(.+))?$/i);
    if(/^prob$/i.test(kind)) q = {text: qtext, type: 'prob', unit: null, srcLine: ln};
    else if(rangeM){
      const unit = (rangeM[1] || '').trim() || null;
      if(!unit) warn('range without a unit — add one like "range weeks"');
      q = {text: qtext, type: 'range', unit, srcLine: ln};
    } else { warn('unknown question type "' + kind + '" — use prob or "range <unit>"'); continue; }

    if(model.questions.length >= MAX_QUESTIONS){
      warn('question limit is ' + MAX_QUESTIONS + ' — "' + qtext.slice(0, 30) + '" ignored');
      continue;
    }
    model.questions.push(q);
  }
  return model;
}
