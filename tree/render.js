/* Public Tree render API. The verdict stays here because the editor, exports
   and renderer all need the identical authored/derived decision sentence. */
import {fmt} from '../assets/series.js';
import {resolveVerdict} from '../assets/verdict-core.js';
import {renderDensity} from './render-density.js';
import {closeCall} from './comparison.js';

export const TOKENS = {slideScale: 1.35};

export function treeVerdictParts(model, results){
  const none = {line: '', fig: ''};
  if(!model.root || model.root.kind !== 'decision') return resolveVerdict(model.verdict, none);
  const rec = results.policy.get(model.root);
  const st = results.stats.get(model.root);
  if(!rec || !st) return resolveVerdict(model.verdict, none);
  const cur = model.currency || '£';
  const money = value => (value < 0 ? '−' : '') + cur + fmt(Math.abs(value));
  const fig = money(st.mean);
  /* a head-to-head share of 45–55% between the top two is a coin toss: say so, naming both. The
     recommendation, the policy and every figure are unchanged (TR-7). */
  const tie = closeCall(model, results);
  const line = tie ? rec.label + ' and ' + tie.rival.label + ' are too close to call — expected value ' + fig
    : 'Choose ' + rec.label + ' — expected value ' + fig;
  return resolveVerdict(model.verdict, {line, fig});
}

export function render(model, results, ctx){
  return renderDensity(model, results, ctx, treeVerdictParts);
}
