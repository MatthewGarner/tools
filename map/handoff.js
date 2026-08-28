/* #93 promote flow, hop 1: untested ASSUMPTION-map propositions → Gauge.
   A Gauge answer is a room's prior, not a designed test and not fresh evidence.
   Other Map presets flag different work (risk ownership, stakeholder attitudes,
   skills coverage, RAG honesty), which must not be translated into probability
   questions merely because they share the same two-axis renderer. Pure. */

export const GAUGE_HANDOFF_TEXT_POLICY = Object.freeze({titleCodePoints: 120, questionCodePoints: 240});

function cleanGaugeLine(value){
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/::/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

const boundedGaugeLine = (value, maxCodePoints, fallback = '') =>
  Array.from(value || fallback).slice(0, maxCodePoints).join('').trim();

function gaugeTitle(value){
  const title = cleanGaugeLine(value).replace(/\/\//g, '∕∕');
  return boundedGaugeLine(title, GAUGE_HANDOFF_TEXT_POLICY.titleCodePoints, 'Assumption check');
}

function gaugeQuestion(value){
  let question = cleanGaugeLine(value);
  if(/^(?:\/\/|(?:title|names|palette|accent|verdict)\s*:)/i.test(question))
    question = 'Assumption — ' + question;
  return boundedGaugeLine(question, GAUGE_HANDOFF_TEXT_POLICY.questionCodePoints);
}

export function gaugeHandoff(model, ro){
  if(gaugeHandoffIssue(model, ro)) return null;
  const lines = [
    'title: ' + gaugeTitle(model.title) + ' — room prior',
    'names: off',
    '// Generated from Map: collect independent prior judgements; this does not replace a test.',
    '',
  ];
  for(const f of ro.flagged){
    lines.push(gaugeQuestion(f.item.label) + ' :: prob');
  }
  return lines.join('\n');
}

export function gaugeHandoffIssue(model, ro){
  if(!model || model.preset !== 'assumptions')
    return 'Only an assumption Map can ask Gauge for independent room priors. Risk, stakeholder, futures, skills, and RAG Maps need their own follow-up.';
  if(!ro || !Array.isArray(ro.flagged) || !ro.flagged.length)
    return 'This assumption Map has no flagged, untested claims to ask the room about.';
  if(ro.flagged.length > 20)
    return 'Gauge supports at most 20 questions. Split the flagged assumptions into smaller Maps before asking the room.';
  if(ro.flagged.some(flag => !gaugeQuestion(flag?.item?.label)))
    return 'A flagged assumption has no portable question text after control characters were removed. Rename it before asking the room.';
  return '';
}
