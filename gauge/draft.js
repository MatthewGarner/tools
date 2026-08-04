/* Durable participant drafts. The relay intentionally cannot return a person's
   private pre-reveal response, so reload recovery belongs on that person's
   device. Keys include session + round + the complete answer schema: a changed
   fragment can never align old answers to different questions by position. */

const VERSION = 1;

export function schemaFingerprint(model){
  const schema = JSON.stringify({
    names: !!model.names,
    questions: (model.questions || []).map(q => ({
      text: q.text,
      type: q.type,
      unit: q.unit || null,
      options: q.options || null,
    })),
  });
  /* Two independent 32-bit hashes keep storage keys short while making an
     accidental schema collision vanishingly unlikely. */
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for(let i = 0; i < schema.length; i++){
    const c = schema.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
    b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') +
    (b >>> 0).toString(16).padStart(8, '0');
}

export const draftKey = (id, round, fingerprint) =>
  'gauge-draft-v' + VERSION + '-' + id + '-r' + round + '-' + fingerprint;

export function encodeDraft({round, fingerprint, fields, name}){
  return JSON.stringify({
    version: VERSION,
    round,
    fingerprint,
    fields: fields.map(f => ({
      q: f.q,
      part: f.part,
      opt: f.opt,
      value: String(f.value),
      touched: !!f.touched,
    })),
    name: String(name || ''),
  });
}

export function decodeDraft(raw, round, fingerprint){
  try{
    const d = JSON.parse(raw);
    if(!d || d.version !== VERSION || d.round !== round ||
      d.fingerprint !== fingerprint || !Array.isArray(d.fields)) return null;
    const fields = d.fields.filter(f => f && Number.isInteger(f.q) &&
      typeof f.part === 'string' && typeof f.value === 'string').map(f => {
      const field = {q: f.q, part: f.part, value: f.value, touched: !!f.touched};
      if(Number.isInteger(f.opt)) field.opt = f.opt;
      return field;
    });
    return {fields, name: typeof d.name === 'string' ? d.name : ''};
  }catch(e){
    return null;
  }
}
