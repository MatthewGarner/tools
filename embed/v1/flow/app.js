import {simulate} from './model/engine.js';
import {parseState, fullToolUrl} from './state.js';
import {mountBridge} from '../bridge.js';

const $ = id => document.getElementById(id);
const format = value => Number(value.toFixed(1)).toString();
const NS = 'http://www.w3.org/2000/svg';
function svgNode(name, attrs = {}, text){
  const node = document.createElementNS(NS, name);
  for(const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if(text !== undefined) node.textContent = text;
  return node;
}

try {
  const initial = parseState(location.hash);
  const params = {...initial.params};
  const capacity = Math.min(params.team, params.wipLimit) * 5 / params.itemDays;
  const samples = Array.from({length:20}, (_, i) => {
    const demand = (i + 1) / 2;
    return {demand, result:simulate({...params, demandPerWeek:demand}, {seed:initial.seed})};
  });
  const stable = samples.filter(sample => sample.result.stable);
  const ceiling = Math.max(1, Math.ceil(Math.max(0, ...stable.map(sample => sample.result.waitDays))));
  $('content').hidden = false;
  if(!initial.controls.length) document.querySelector('.eyebrow').textContent = 'Flow · article illustration';
  $('demand-control').hidden = !initial.controls.includes('demand');
  $('reset').hidden = !initial.controls.length;
  $('assumptions').textContent = params.team + ' people · average item size ' + params.itemDays +
    ' working days · WIP limit ' + (params.wipLimit === 40 ? '40 (full Flow’s “no limit” setting)' : params.wipLimit) +
    ' · ' + {low:'low',med:'medium',high:'high'}[params.cov] + ' variability. Capacity: ' + format(capacity) + ' items/week.';

  function draw(){
    const width = Math.max(240, $('chart').clientWidth), height = 222;
    const left = 42, right = width - 12, top = 25, bottom = 178;
    const x = value => left + value / 10 * (right - left);
    const y = value => bottom - Math.max(0, value) / ceiling * (bottom - top);
    const svg = svgNode('svg', {width, height, viewBox:`0 0 ${width} ${height}`, role:'img', 'aria-labelledby':'chart-title chart-description'});
    svg.append(svgNode('title', {id:'chart-title'}, 'Average waiting time as weekly demand rises'));
    svg.append(svgNode('desc', {id:'chart-description'}, 'Each point is a fixed simulation. The curve shows stable demand levels only; no stable waiting time exists at or above capacity.'));
    if(capacity < 10) svg.append(svgNode('rect', {x:x(capacity), y:top, width:right-x(capacity), height:bottom-top, class:'overload'}));
    for(const value of [0, ceiling / 2, ceiling]){
      svg.append(svgNode('line', {x1:left, x2:right, y1:y(value), y2:y(value), class:'grid'}));
      svg.append(svgNode('text', {x:left-8, y:y(value)+4, 'text-anchor':'end'}, format(value)));
    }
    for(const value of [0, 2, 4, 6, 8, 10]) svg.append(svgNode('text', {x:x(value), y:bottom+20, 'text-anchor':'middle'}, value));
    svg.append(svgNode('text', {x:left, y:12}, 'Waiting · working days'));
    svg.append(svgNode('text', {x:(left+right)/2, y:height-2, 'text-anchor':'middle'}, 'Demand · items per week'));
    if(capacity <= 10) svg.append(svgNode('line', {x1:x(capacity), x2:x(capacity), y1:top, y2:bottom, class:'capacity'}));
    if(stable.length > 1) svg.append(svgNode('polyline', {points:stable.map(sample => `${x(sample.demand)},${y(sample.result.waitDays)}`).join(' '), class:'curve'}));
    const selected = samples.find(sample => sample.demand === params.demandPerWeek);
    if(selected.result.stable){
      svg.append(svgNode('circle', {cx:x(selected.demand), cy:y(selected.result.waitDays), r:5, class:'marker'}));
      const waiting = format(selected.result.waitDays);
      $('result').textContent = waiting + ' working day' + (waiting === '1' ? '' : 's') + ' waiting, on average, at ' + format(selected.demand) + ' items/week.';
    } else {
      svg.append(svgNode('line', {x1:x(selected.demand), x2:x(selected.demand), y1:top, y2:bottom, class:'curve'}));
      $('result').textContent = 'No stable waiting time at ' + format(selected.demand) + ' items/week: demand is at or above capacity. The queue cannot settle.';
    }
    $('chart').replaceChildren(svg);
  }

  let linkRevision = 0;
  async function refresh(){
    $('demand').value = params.demandPerWeek;
    $('demand-value').textContent = format(params.demandPerWeek) + ' items/week';
    draw();
    const revision = ++linkRevision;
    // Remove the previous link while encoding, so a fast click cannot open stale inputs.
    $('full-tool').removeAttribute('href');
    const url = await fullToolUrl(params, location.origin);
    if(revision === linkRevision) $('full-tool').href = url;
  }
  $('demand').addEventListener('input', () => { params.demandPerWeek = +$('demand').value; refresh(); });
  $('reset').addEventListener('click', () => { Object.assign(params, initial.params); refresh(); });
  let previousWidth = 0;
  new ResizeObserver(() => {
    const width = $('chart').clientWidth;
    if(width !== previousWidth){ previousWidth = width; draw(); }
  }).observe($('chart'));
  await refresh();
  mountBridge($('demo'));
} catch(error){
  $('content').hidden = true;
  $('error').hidden = false;
  $('error').textContent = 'This demonstration could not load. ' + error.message;
}
