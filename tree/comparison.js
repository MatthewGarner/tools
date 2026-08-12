/* Pure projection for the fixed-canvas Decision comparison export. */
import {evalDet, findByLine, loadBearing} from './engine.js';

function probabilityText(node){
  if(node.p === 'rest') return 'rest';
  if(node.pRaw) return 'p=' + node.pRaw;
  return node.p.lo === node.p.hi ? 'p=' + node.p.lo : 'p=' + node.p.lo + '–' + node.p.hi;
}

function chanceInputs(option){
  const inputs = [];
  (function walk(node, path){
    const here = node === option ? path : [...path, node.label];
    if(node.kind === 'chance'){
      for(const child of node.children){
        inputs.push({node:child, label:[...here, child.label].join(' › '), authored:probabilityText(child)});
        walk(child, here);
      }
    } else {
      for(const child of node.children) walk(child, here);
    }
  })(option, []);
  return inputs;
}

function pairedRate(results, option, recommendation){
  if(option === recommendation) return null;
  const pair = (results.headToHead || []).find(row =>
    (row.aNode === option && row.bNode === recommendation) ||
    (row.aNode === recommendation && row.bNode === option));
  if(!pair) return null;
  return pair.aNode === option ? pair.aShare : 1 - pair.aShare;
}

function closestFlip(model){
  const mark = loadBearing(model).find(entry => !entry.degenerate && entry.nearestFlip !== null);
  if(!mark) return null;
  const node = findByLine(model, mark.ref.line);
  if(!node) return null;
  const authored = mark.ref.kind === 'prob' ? node.p : node.value;
  if(!authored || authored === 'rest') return null;
  const threshold = mark.nearestFlip;
  return {
    kind:mark.ref.kind,
    label:node.label,
    threshold,
    authored:{lo:authored.lo, hi:authored.hi},
    insideAuthoredRange:threshold >= authored.lo && threshold <= authored.hi,
    story:'midpoint',
  };
}

export function decisionComparisonProjection(model, results){
  if(!model?.root || model.root.kind !== 'decision'){
    return {options:[], recommendation:null, midpointRecommendation:null,
      modelDisagreement:false, closestFlip:null};
  }
  const recommendation = results.policy.get(model.root) || null;
  const midpointRecommendation = evalDet(model).rec;
  const options = model.root.children.map(node => ({
    node,
    label:node.label,
    recommended:node === recommendation,
    stats:results.stats.get(node) || null,
    winRateVsRecommendation:pairedRate(results, node, recommendation),
    chanceInputs:chanceInputs(node),
  }));
  return {options, recommendation, midpointRecommendation,
    modelDisagreement:!!recommendation && !!midpointRecommendation && recommendation !== midpointRecommendation,
    closestFlip:closestFlip(model)};
}
