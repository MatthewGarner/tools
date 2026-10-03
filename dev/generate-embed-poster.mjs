/* Article fallback computed from the same validated, frozen model as the demo. */
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {simulate} from '../embed/v1/flow/model/engine.js';
import {DEFAULT_PARAMS, parseState} from '../embed/v1/flow/state.js';

const DEFAULT_EXAMPLE = {tool:'flow', version:1, view:'waiting-time', params:DEFAULT_PARAMS, seed:61709, controls:['demand']};
const round = value => Number(value.toFixed(1));
const days = value => round(value) + ' working day' + (round(value) === 1 ? '' : 's');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[char]));

export function renderPoster(example = DEFAULT_EXAMPLE){
  if(!example || typeof example !== 'object' || example.tool !== 'flow' || example.version !== 1 || example.view !== 'waiting-time')
    throw new Error('Poster supports tool flow, version 1, view waiting-time only.');
  const {params, seed} = parseState(encodeURIComponent(JSON.stringify({params:example.params, seed:example.seed, controls:example.controls})));
  const samples = Array.from({length:20}, (_, i) => {
    const demand = (i + 1) / 2;
    return {demand, result:simulate({...params, demandPerWeek:demand}, {seed})};
  });
  const stable = samples.filter(point => point.result.stable);
  const ceiling = Math.max(1, Math.ceil(Math.max(0, ...stable.map(point => point.result.waitDays))));
  const selected = samples.find(point => point.demand === params.demandPerWeek);
  const capacity = selected.result.capacityPerWeek;
  const x = demand => 72 + demand / 10 * 600;
  const y = wait => 278 - Math.max(0, wait) / ceiling * 156;
  const variability = {low:'low', med:'medium', high:'high'}[params.cov];
  const assumptions = params.team + (params.team === 1 ? ' person' : ' people') + ' · average item ' +
    params.itemDays + (params.itemDays === 1 ? ' day' : ' days') + ' · WIP ' + params.wipLimit + ' · ' + variability + ' variability';
  const summary = selected.result.stable
    ? days(selected.result.waitDays) + ' waiting on average at ' + params.demandPerWeek + ' items/week.'
    : 'No stable waiting time at ' + params.demandPerWeek + ' items/week.';
  const capacityNote = 'Capacity: ' + round(capacity) + ' items/week' +
    (capacity > 10 ? ' (above the plotted range).' : '. At or above capacity, the queue cannot settle.');
  const alt = 'Flow plots average waiting against demand from 0.5 to 10 items/week. ' + summary + ' ' + capacityNote +
    ' ' + assumptions.replaceAll(' · ', ', ') + '. Fixed-seed simulation, not a delivery forecast.';
  const text = (x, y, value, size = 14, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(value)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="448" viewBox="0 0 720 448" role="img" aria-labelledby="title description">
<title id="title">How demand creates waiting</title>
<desc id="description">${escape(alt)}</desc>
<rect width="720" height="448" fill="#FBFBFA"/>
<g font-family="system-ui, sans-serif" fill="#111111">
${text(32,32,'FLOW · ARTICLE EXAMPLE',12,'fill="#6B6B68" letter-spacing="1"')}
${text(32,66,'How demand creates waiting',26,'font-weight="650"')}
${text(72,108,'Average waiting · working days',14,'fill="#6B6B68"')}
${capacity < 10 ? `<rect x="${x(capacity)}" y="122" width="${672-x(capacity)}" height="156" fill="#F4F4F1"/>` : ''}
${[0, ceiling / 2, ceiling].map(value => `<line x1="72" x2="672" y1="${y(value)}" y2="${y(value)}" stroke="#D9D9D5"/>` + text(60,y(value)+5,round(value),14,'text-anchor="end" fill="#6B6B68"')).join('\n')}
${[0,2,4,6,8,10].map(value => text(x(value),300,value,14,'text-anchor="middle" fill="#6B6B68"')).join('\n')}
${text(372,324,'Demand · items per week',14,'text-anchor="middle" fill="#6B6B68"')}
${capacity <= 10 ? `<line data-capacity="${capacity}" x1="${x(capacity)}" x2="${x(capacity)}" y1="122" y2="278" stroke="#6B6B68" stroke-dasharray="4 4"/>` : ''}
${stable.length > 1 ? `<polyline data-wait-curve="true" points="${stable.map(point => `${x(point.demand)},${y(point.result.waitDays)}`).join(' ')}" fill="none" stroke="#1F4FD8" stroke-width="3" stroke-linejoin="round"/>` : ''}
${stable.length === 1 ? `<circle cx="${x(stable[0].demand)}" cy="${y(stable[0].result.waitDays)}" r="3" fill="#1F4FD8"/>` : ''}
${stable.length === 0 ? text(372,195,'No stable demand in the plotted range.',15,'text-anchor="middle" fill="#6B6B68"') : ''}
${selected.result.stable
  ? `<circle data-selected-demand="${params.demandPerWeek}" cx="${x(selected.demand)}" cy="${y(selected.result.waitDays)}" r="6" fill="#1F4FD8" stroke="#FBFBFA" stroke-width="2"/>`
  : `<line data-selected-demand="${params.demandPerWeek}" x1="${x(selected.demand)}" x2="${x(selected.demand)}" y1="122" y2="278" stroke="#1F4FD8" stroke-width="3"/>`}
${text(32,360,summary,18,'font-weight="600"')}
${text(32,382,capacityNote,13,'fill="#6B6B68"')}
${text(32,409,assumptions,13,'fill="#6B6B68"')}
${text(32,431,'Fixed-seed simulation · one queue · not a delivery forecast',12,'fill="#6B6B68"')}
</g>
</svg>\n`;
  return {svg, alt, summary};
}

function main(args){
  const options = {};
  for(let index = 0; index < args.length; index += 2){
    const key = args[index];
    if(!['--example', '--output'].includes(key) || !args[index+1] || args[index+1].startsWith('--') || options[key])
      throw new Error('Usage: node dev/generate-embed-poster.mjs [--example manifest.json --output figure.svg]');
    options[key] = args[index+1];
  }
  if(options['--example'] && !options['--output']) throw new Error('--example requires --output so it cannot overwrite the shipped default figure.');
  const example = options['--example'] ? JSON.parse(readFileSync(options['--example'], 'utf8')) : DEFAULT_EXAMPLE;
  const output = options['--output'] || new URL('../embed/v1/flow/poster.svg', import.meta.url);
  // Validation and rendering finish before opening the destination: bad input preserves existing output.
  const {svg, alt, summary} = renderPoster(example);
  writeFileSync(output, svg);
  console.log('Generated ' + (output.pathname || output));
  console.log('Suggested alt: ' + alt);
  console.log('Suggested summary: ' + summary);
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  try { main(process.argv.slice(2)); }
  catch(error){ console.error(error.message); process.exitCode = 1; }
}
