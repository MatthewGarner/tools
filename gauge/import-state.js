import {validHandoffMeta} from '../assets/handoff.js';
import {parse} from './parse.js';

export function gaugeImport(state){
  const meta = validHandoffMeta(state && state.x, {from: 'map', kind: 'question-set'});
  if(!meta || typeof state.t !== 'string') return null;
  const model = parse(state.t);
  if(!model.questions.length) return null;
  return {text: state.t, meta};
}
