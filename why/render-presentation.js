/* Fixed 16:9 Why export: first outcome, then its deepest authored path to a
   solution. The native OST remains exhaustive; this is an explicit summary. */
import {esc, wrapText} from '../assets/svg.js';
import {PALETTES, scheme} from '../assets/series.js';
import {project} from './project.js';
import {renderOst} from './render-ost.js';

const W = 1920, H = 1080, M = 100;
const BODY = {x: M, y: 230, w: W - M*2, h: 650};

const children = node => node.children.filter(c => c.kind !== 'assumption');
const countNodes = nodes => nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);

function bestPath(node){
  const here = [node];
  let best = here;
  for(const child of children(node)){
    const candidate = [node, ...bestPath(child)];
    const candidateEndsSolution = candidate[candidate.length - 1].kind === 'solution';
    const bestEndsSolution = best[best.length - 1].kind === 'solution';
    if((candidateEndsSolution && !bestEndsSolution) ||
       (candidateEndsSolution === bestEndsSolution && candidate.length > best.length)) best = candidate;
  }
  return best;
}

function clonePath(path){
  let child = null;
  for(let i = path.length - 1; i >= 0; i--){
    const node = path[i];
    const assumptions = node.kind === 'solution'
      ? node.children.filter(c => c.kind === 'assumption').map(a => ({...a, children: []})) : [];
    child = {...node, children: [...(child ? [child] : []), ...assumptions]};
  }
  return child;
}

export function selectWhyPresentation(model){
  const outcome = model.outcomes[0];
  if(!outcome) return {model: {...model, outcomes: []}, path: [], omitted: 0, line: 'NO OUTCOMES'};
  const path = bestPath(outcome);
  const root = clonePath(path);
  const shown = countNodes([root]);
  const total = countNodes(model.outcomes);
  return {
    model: {...model, outcomes: [root]}, path, shown, total, omitted: total - shown,
    line: 'SHOWING OUTCOME 1 OF ' + model.outcomes.length + ' · DEEPEST SOLUTION CHAIN · ' +
      shown + ' OF ' + total + ' NODES' + (total > shown ? ' · ' + (total - shown) + ' CONTINUE' : ''),
  };
}

function dims(svg){
  const width = +(svg.match(/\bwidth="([\d.]+)"/) || [0, 1])[1];
  const height = +(svg.match(/\bheight="([\d.]+)"/) || [0, 1])[1];
  return {width, height};
}
function inner(svg){ return svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')); }

export function renderWhyPresentation(model, ctx){
  const selection = selectWhyPresentation(model);
  const paletteHex = model.accent || (PALETTES[model.palette] && PALETTES[model.palette][ctx.dark ? 'dark' : 'light']);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, !!ctx.dark)} : ctx.colors;
  const selectedProjection = project(selection.model);
  const chart = renderOst(selection.model, selectedProjection, {...ctx, edit: false, slide: true, bare: true}, null);
  const d = dims(chart);
  const scale = Math.min(BODY.w / d.width, BODY.h / d.height, 1.55);
  const x = BODY.x + (BODY.w - d.width*scale)/2;
  const y = BODY.y + (BODY.h - d.height*scale)/2;
  const titleLines = wrapText(model.title || 'Opportunity solution tree',
    '700 38px sans-serif', W - M*2 - 220, ctx.measure).slice(0, 2);
  const s = [
    '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>',
    '<rect x="' + M + '" y="64" width="56" height="5" rx="2.5" fill="' + C.accent + '"/>',
  ];
  titleLines.forEach((line, i) => s.push('<text x="' + M + '" y="' + (124 + i*44) +
    '" font-size="38" font-weight="700" fill="' + C.ink + '">' + esc(line) + '</text>'));
  s.push('<text x="' + (W - M) + '" y="124" text-anchor="end" font-size="17" fill="' + C.muted + '">' +
    esc(String(ctx.today || '')) + '</text>');
  s.push('<text x="' + M + '" y="210" font-size="14" font-weight="700" letter-spacing="1.8" fill="' +
    C.accent + '">PRESENTATION PATH · FIRST OUTCOME / DEEPEST SOLUTION CHAIN</text>');
  s.push('<svg x="' + x + '" y="' + y + '" width="' + d.width*scale + '" height="' + d.height*scale +
    '" viewBox="0 0 ' + d.width + ' ' + d.height + '">' + inner(chart) + '</svg>');
  s.push('<rect x="' + M + '" y="914" width="' + (W - M*2) + '" height="54" fill="' + C.card +
    '" stroke="' + C.border + '"/>');
  s.push('<text x="' + (M + 18) + '" y="947" font-size="14" font-weight="700" letter-spacing="1" fill="' +
    C.muted + '">' + esc(selection.line) + '</text>');
  s.push('<line x1="' + M + '" y1="1002" x2="' + (W - M) + '" y2="1002" stroke="' + C.border + '"/>');
  s.push('<text x="' + M + '" y="1036" font-size="17" font-weight="600" fill="' + C.muted + '">FULL TREE · DOWNLOAD SVG</text>');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">' + s.join('') + '</svg>';
}
