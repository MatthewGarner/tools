/* Pure text rewrites for /gauge add/remove question. No DOM.
   Text stays the source of truth: adding or removing is exactly one text change. */
import {parse} from './parse.js';

export const QUESTION_TEMPLATE = 'New question :: prob';

/* Where a new question line goes: after the last question, else after the
   config block, else at the end of the doc. Returns a 0-based line index. */
export function addQuestionLine(text){
  const model = parse(text);
  if(model.questions.length){
    return {afterLine: model.questions[model.questions.length - 1].srcLine, newLine: QUESTION_TEMPLATE};
  }
  const lines = text.split(/\r?\n/);
  let lastConfig = -1;
  for(let i = 0; i < lines.length; i++){
    if(/^(title|names|palette|accent)\s*:/i.test(lines[i].trim())) lastConfig = i;
  }
  return {afterLine: lastConfig >= 0 ? lastConfig : lines.length - 1, newLine: QUESTION_TEMPLATE};
}

/* Only lines that parse as questions may be removed. */
export function removeQuestionLine(text, srcLine){
  return parse(text).questions.some(q => q.srcLine === srcLine);
}
