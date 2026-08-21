/* model + layout → Wardley Strategic Field SVG.
   Evolution is an authored horizontal claim. The vertical arrangement is only a
   dependency projection (`A -> B` means A needs B), so this renderer never
   pretends to quantify visibility. The same field has three projections:
   live wide for inspection/editing, a source-order phone ledger, and a
   complete-or-refused presentation plate. */
import {esc, wrapText} from '../assets/svg.js';
import {svgVerdict} from '../assets/verdict-svg.js';
import {resolveVerdict} from '../assets/verdict.js';
import {diffItems} from '../assets/snapshots.js';
import {STAGES, stageOf} from './parse.js';
import {layoutMap} from './layout.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = "'Helvetica Neue',Helvetica,'Segoe UI',Roboto,sans-serif";
const SANS_SQATTR = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
export const GEOM = {w:1200, pad:56};
export const NARROW = 520;

const r = n => Math.round(n * 100) / 100;
const count = (n, singular, plural = singular + 's') => n + ' ' + (n === 1 ? singular : plural);
const componentList = model => [...model.components.values()];
const norm = value => String(value || '').toLowerCase();
const sourceOrder = (a,b) => a.srcLine-b.srcLine || (a.order ?? 0)-(b.order ?? 0) || a.name.localeCompare(b.name);

/* A source title, identifier, URL, or narrow mobile fact cannot be allowed to
   run through a neighbouring rail. Preserve every character, splitting an
   unbroken word only when measurement proves that it cannot fit. */
function lines(text, font, width, measure){
  const initial = wrapText(String(text || ''), font, width, measure);
  const out = [];
  for(const line of initial){
    if(measure(line, font) <= width){ out.push(line); continue; }
    let bit = '';
    for(const ch of line){
      if(bit && measure(bit + ch, font) > width){ out.push(bit); bit = ch; }
      else bit += ch;
    }
    if(bit) out.push(bit);
  }
  return out.length ? out : [''];
}

function stageText(value){
  const node = value && typeof value === 'object' ? value : null;
  const x = node ? node.x : value;
  if(x === null || x === undefined) return 'UNPLACED';
  /* A named stage is a compact categorical source claim; a direct `@ 0.3333`
     is an exact coordinate and must never be rounded into a different claim. */
  const position = node && !node.stage && node.positionRaw !== null && node.positionRaw !== undefined
    ? node.positionRaw : Number(x).toFixed(2);
  return stageOf(x).name.toUpperCase() + ' · ' + position;
}

function relationIndex(model){
  const names = new Map();
  for(const anchor of model.anchors) names.set(norm(anchor.name), anchor.name);
  for(const component of model.components.values()) names.set(norm(component.name), component.name);
  const needs = new Map(), neededBy = new Map();
  for(const edge of model.edges){
    const out = needs.get(edge.from) || []; out.push(edge.to); needs.set(edge.from, out);
    const incoming = neededBy.get(edge.to) || []; incoming.push(edge.from); neededBy.set(edge.to, incoming);
  }
  const label = key => names.get(key) || key;
  const ancestors = key => {
    const result = [], seen = new Set(), visit = k => {
      if(seen.has(k)) return; seen.add(k);
      for(const parent of neededBy.get(k) || []){
        if(model.anchors.some(anchor => norm(anchor.name) === parent)) result.push(label(parent));
        else visit(parent);
      }
    };
    visit(key);
    return [...new Set(result)];
  };
  return {names, needs, neededBy, label, ancestors};
}

/* The internal verbal line has to remain factual. “Load-bearing” used to turn
   a direct-dependant count into a recommendation; this says exactly what the
   source and projection know, and authored `verdict:` still wins unchanged. */
export function mapReadout(model, layout, opts = {}){
  const components = layout.nodes.filter(node => !node.anchor);
  const placed = components.filter(node => node.x !== null);
  const indexed = placed.map(node => ({node, direct:layout.needs.get(norm(node.name)) || 0}))
    .sort((a,b) => b.direct - a.direct || a.node.srcLine - b.node.srcLine);
  let derived = '', fig = '';
  if(indexed[0]?.direct){
    const lead = indexed[0];
    fig = count(lead.direct, 'direct dependant');
    derived = lead.node.name + ' has ' + fig + '; its evolution position is ' + stageText(lead.node) + '. This is not a delivery forecast.';
  }else if(placed.length){
    const left = placed.filter(node => node.x < .5).length;
    fig = left + ' of ' + placed.length;
    derived = fig + ' placed components sit before product; evolution positions are current strategic claims, not a delivery forecast.';
  }else derived = 'No evolution positions are placed yet.';
  const flags = [];
  /* Parser warnings are factual source diagnostics. Keep their line identity
     intact in native, phone, markdown and the complete presentation plate;
     a generic ghost count is not an honest substitute for a bad declaration. */
  for(const warning of model.warnings) flags.push(warning);
  for(const edge of layout.droppedEdges)
    flags.push('DEPENDENCY LOOP · ' + edge.from + ' → ' + edge.to + ' is retained in source but omitted from the vertical projection.');
  const authored = resolveVerdict(model.verdict, {line:derived, fig});
  return {verdict:authored.line, fig:authored.fig, flags};
}

function edgeFacts(model, previous){
  const key = edge => edge.from + '→' + edge.to;
  const old = new Map(previous.edges.map(edge => [key(edge), edge]));
  const current = new Map(model.edges.map(edge => [key(edge), edge]));
  return {
    added:[...current.keys()].filter(k => !old.has(k)).map(k => current.get(k)),
    dropped:[...old.keys()].filter(k => !current.has(k)).map(k => old.get(k)),
  };
}

function strategicDiff(model, compare){
  if(!compare?.prev) return null;
  const previous = compare.prev;
  const currentNames = relationIndex(model), previousNames = relationIndex(previous);
  const nodeDiff = diffItems(componentList(previous), componentList(model), {
    key:item => item.name,
    /* This is a strategic claim, not a charting tolerance: comparisons use
       the full parsed coordinate. Named stages and their exact numeric
       equivalent resolve to the same effective position, while 0.3333 →
       0.3349 remains a visible authored change. */
    state:item => item.x === null ? 'unplaced' : 'x:' + String(item.x),
  });
  const previousByName = new Map(componentList(previous).map(item => [norm(item.name), item]));
  const moved = [...nodeDiff.moved.values()];
  const edges = edgeFacts(model, previous);
  const oldAnchors = new Set(previous.anchors.map(anchor => norm(anchor.name))), newAnchors = new Set(model.anchors.map(anchor => norm(anchor.name)));
  const facts = [];
  for(const movement of moved){
    const beforeNode = previousByName.get(norm(movement.item.name));
    const before = beforeNode?.x === null || !beforeNode ? 'UNPLACED' : stageText(beforeNode);
    const after = movement.item.x === null ? 'UNPLACED' : stageText(movement.item);
    facts.push('WAS ' + before + ' → ' + after + ' · ' + movement.item.name);
  }
  for(const added of nodeDiff.added) facts.push('NEW · ' + added.name);
  for(const dropped of nodeDiff.dropped) facts.push('DROPPED · ' + dropped.name);
  for(const edge of edges.added) facts.push('DEPENDENCY ADDED · ' + currentNames.label(edge.from) + ' → ' + currentNames.label(edge.to));
  for(const edge of edges.dropped) facts.push('DEPENDENCY DROPPED · ' + previousNames.label(edge.from) + ' → ' + previousNames.label(edge.to));
  for(const anchor of model.anchors) if(!oldAnchors.has(norm(anchor.name))) facts.push('USER NEED ADDED · ' + anchor.name);
  for(const anchor of previous.anchors) if(!newAnchors.has(norm(anchor.name))) facts.push('USER NEED DROPPED · ' + anchor.name);
  return {label:compare.label || 'snapshot', facts};
}

function comparisonReceipt(diff, x, y, width, c, measure, size = 11){
  if(!diff) return {svg:'', height:0};
  const all = diff.facts.length ? diff.facts : ['NO STRATEGIC CLAIMS CHANGED'];
  const rendered = [];
  let cursor = y;
  rendered.push('<g data-strategic-diff="" aria-label="Comparison with ' + esc(diff.label) + '">');
  rendered.push('<text x="' + x + '" y="' + cursor + '" font-size="10" font-weight="700" letter-spacing="1.5" fill="' + c.muted + '">COMPARE · ' + esc(diff.label.toUpperCase()) + '</text>');
  cursor += 18;
  for(const fact of all){
    for(const line of lines(fact, '600 ' + size + 'px ' + SANS, width, measure)){
      rendered.push('<text x="' + x + '" y="' + cursor + '" font-size="' + size + '" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>');
      cursor += size + 6;
    }
  }
  rendered.push('</g>');
  return {svg:rendered.join(''), height:cursor-y};
}

function labelPlane(node, relations, c){
  const x = node.cardX, y = node.y - node.cardH / 2, w = node.cardW, h = node.cardH;
  const detail = node.anchor ? 'USER NEED' : stageText(node);
  const needs = relations.needs.get(norm(node.name)) || [];
  const by = relations.neededBy.get(norm(node.name)) || [];
  const accessible = node.name + '. ' + (node.anchor ? 'User need.' : 'Evolution ' + detail + '.') +
    (needs.length ? ' Needs ' + needs.map(relations.label).join(', ') + '.' : '') +
    (by.length ? ' Needed by ' + by.map(relations.label).join(', ') + '.' : '');
  const inner = [];
  inner.push('<rect class="strategic-label-plane" x="' + r(x) + '" y="' + r(y) + '" width="' + r(w) + '" height="' + r(h) +
    '" fill="' + c.bg + '" stroke="' + (node.ghost ? c.muted : c.border) + '" stroke-width="1"' +
    (node.ghost ? ' stroke-dasharray="4 3"' : '') + '/>');
  if(!node.anchor && node.x !== null) inner.push('<line data-evolution-pin="" data-authored-x="' + node.x + '" x1="' + r(node.px) + '" y1="' + r(y-8) + '" x2="' + r(node.px) + '" y2="' + r(y) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
  const editKind = node.anchor ? 'anchor' : 'name';
  /* The wide Field keeps one 44px rename plane and one 44px evolution plane
     physically separate. A title never doubles as an ambiguous stage tap. */
  const hitW = Math.max(44, w - 52), hitH = Math.max(44, node.lines.length * 16 + 12);
  inner.push('<rect data-title-hit="" data-edit="' + editKind + '" data-line="' + node.srcLine + '" data-raw="' + esc(node.name) +
    '" x="' + r(x+4) + '" y="' + r(y) + '" width="' + r(hitW) + '" height="' + r(hitH) +
    '" fill="' + c.bg + '" fill-opacity="0" tabindex="0" role="button" aria-label="Rename ' + (node.anchor ? 'user need' : 'component') + ': ' + esc(node.name) + '"/>');
  const lineY = y + 18;
  node.lines.forEach((line, index) => {
    inner.push('<text x="' + r(x+12) + '" y="' + r(lineY+index*16) + '" font-size="13" font-weight="650" fill="' + (node.ghost ? c.muted : c.ink) + '" pointer-events="none">' + esc(line) + '</text>');
  });
  if(!node.anchor) inner.push('<text x="' + r(x+w-10) + '" y="' + r(y+h-8) + '" text-anchor="end" font-size="9" font-weight="700" letter-spacing=".9" fill="' + c.muted + '" pointer-events="none">' + esc(detail) + '</text>');
  if(node.anchor) return '<g class="strategic-anchor" data-source-line="' + node.srcLine + '" aria-label="' + esc(accessible) + '">' + inner.join('') + '</g>';
  const raw = node.stage || (node.x === null ? '' : String(node.x));
  const stageHit = node.ghost ? '' : '<rect data-stage-hit="" data-edit="stage" data-line="' + node.srcLine + '" data-raw="' + esc(raw) +
    '" x="' + r(x+w-44) + '" y="' + r(y+Math.max(0,(h-44)/2)) + '" width="44" height="44"' +
    ' fill="' + c.bg + '" fill-opacity="0" tabindex="0" role="button" aria-label="Cycle evolution stage: ' + esc(node.name) + '"/>';
  /* The two action planes are sibling strips: title at left, exact evolution
     at right. Inert text yields to the correct plane without a hidden overlay. */
  const layered = inner.slice(0,2).concat(stageHit, inner.slice(2)).join('');
  return '<g data-drag="evo" data-name="' + esc(node.name) + '" data-line="' + node.srcLine + '" data-strategic-node="' + esc(node.id) +
    '" aria-label="' + esc(accessible) + '">' + layered + '</g>';
}

function componentMenu(node, c, width, nodes){
  const others = nodes.filter(other => other !== node).map(other => ({x:other.cardX,y:other.y-other.cardH/2,w:other.cardW,h:other.cardH}));
  const free = (x,y) => x-22 >= 4 && x+22 <= width-4 && !others.some(other =>
    x+22 > other.x && x-22 < other.x+other.w && y+22 > other.y && y-22 < other.y+other.h);
  const right=node.cardX+node.cardW+25,left=node.cardX-25,gap=node.cardH/2+26;
  const candidates=[[right,node.y],[left,node.y],[right,node.y-gap],[left,node.y-gap],[right,node.y+gap],[left,node.y+gap],
    [right,node.y-gap*2],[left,node.y-gap*2],[right,node.y+gap*2],[left,node.y+gap*2],
    /* Dense fields still have one safe last resort: a component's own right
       action strip. It can never cover a neighbouring strategic claim. */
    [node.cardX+node.cardW-22,node.y]];
  const [x,y] = candidates.find(([cx,cy]) => free(cx,cy)) || [node.cardX+node.cardW-22,node.y];
  return {x,y,svg:'<g data-edit="componentmenu" data-line="' + node.srcLine + '" data-raw="' + esc(node.name) + '" data-menu-for="' + esc(node.name) + '" tabindex="0" role="button" aria-label="More options: ' + esc(node.name) + '">' +
    '<rect x="' + r(x-22) + '" y="' + r(y-22) + '" width="44" height="44" fill="' + c.bg + '" fill-opacity="0" data-hit=""/>' +
    '<text x="' + r(x) + '" y="' + r(y+4) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + c.muted + '" pointer-events="none">⋯</text></g>'};
}

function addZone(stage, y, width, pad, c){
  const x = pad + stage.mid * (width - 2*pad);
  return '<g data-edit="additem" data-stage="' + stage.name + '" data-line="-1" data-raw="" tabindex="0" role="button" aria-label="Add component in ' + stage.name + '">' +
    '<rect x="' + r(x-46) + '" y="' + r(y-16) + '" width="92" height="32" fill="none" stroke="' + c.border + '" stroke-dasharray="3 4"/>' +
    '<text x="' + r(x) + '" y="' + r(y+4) + '" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="1.2" fill="' + c.muted + '" pointer-events="none">ADD</text>' +
    '<rect x="' + r(x-54) + '" y="' + r(y-22) + '" width="108" height="44" fill="' + c.bg + '" fill-opacity="0" data-hit=""/></g>';
}

function edgePath(link, c){
  const y1 = link.y1 + link.fromNode.cardH / 2, y2 = link.y2 - link.toNode.cardH / 2;
  const bend = Math.min(54, Math.max(16, (y2-y1)/2));
  const path = y2 <= y1 + 6
    ? 'M ' + r(link.x1) + ' ' + r(link.y1) + ' L ' + r(link.x2) + ' ' + r(link.y2)
    : 'M ' + r(link.x1) + ' ' + r(y1) + ' C ' + r(link.x1) + ' ' + r(y1+bend) + ', ' + r(link.x2) + ' ' + r(y2-bend) + ', ' + r(link.x2) + ' ' + r(y2);
  return '<path class="edge' + (link.dropped ? ' dropped' : '') + '" d="' + path + '" fill="none" stroke="' + (link.dropped ? c.err : c.muted) +
    '" stroke-opacity="' + (link.dropped ? '.9' : '.48') + '" stroke-width="' + (link.dropped ? '1.4' : '1.15') + '"' + (link.dropped ? ' stroke-dasharray="3 4"' : '') + '/>';
}

function ruler(layout, c){
  const {w,pad,axisY} = layout;
  const fragments = ['<g data-evolution-ruler="">',
    '<line x1="' + pad + '" y1="' + axisY + '" x2="' + (w-pad) + '" y2="' + axisY + '" stroke="' + c.ink + '" stroke-width="1.2"/>',
    '<text x="' + pad + '" y="' + (axisY+30) + '" font-size="10" font-weight="700" letter-spacing="1.4" fill="' + c.muted + '">EVOLUTION →</text>'];
  for(const stage of STAGES){
    const x = pad + stage.mid * (w-2*pad);
    fragments.push('<line x1="' + x + '" y1="' + (axisY-7) + '" x2="' + x + '" y2="' + (axisY+7) + '" stroke="' + c.ink + '" stroke-width="1"/>');
    fragments.push('<text x="' + x + '" y="' + (axisY+30) + '" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="1.3" fill="' + c.muted + '">' + stage.name.toUpperCase() + '</text>');
  }
  fragments.push('</g>');
  return fragments.join('');
}

function fieldWide(model, suppliedLayout, ctx, opts = {}, presentation = false){
  const c = ctx.colors, measure = ctx.measure;
  let layout = suppliedLayout;
  const {w,pad} = layout;
  const relations = relationIndex(model);
  const title = lines(model.title || 'Wardley map', '700 ' + (presentation ? 36 : 24) + 'px ' + SERIF, w-pad*2-100, measure);
  const diff = strategicDiff(model, opts.compare);
  const components = layout.nodes.filter(node => !node.anchor);
  const header = [];
  let y = presentation ? 64 : 38;
  title.forEach((line, index) => header.push('<text x="' + pad + '" y="' + (y+index*(presentation?38:28)) + '" font-family="' + SERIF +
    '" font-size="' + (presentation?36:24) + '" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'));
  y += title.length*(presentation?38:28) + (presentation?16:10);
  /* The document palette has one deliberate job in this restrained system:
     a short inspection rule. It never re-colours evolution positions. */
  /* The quiet document rule sits in its own title/metadata gutter. It must
     never bisect the first factual metric line at the plate's text baseline. */
  const accentY = y - (presentation ? 24 : 16);
  header.push('<line data-document-accent="" x1="' + pad + '" y1="' + accentY + '" x2="' + (pad+(presentation?34:24)) + '" y2="' + accentY + '" stroke="' + c.accent + '" stroke-width="2"/>');
  if(typeof ctx.today === 'string') header.push('<text x="' + (w-pad) + '" y="' + (presentation?52:26) + '" text-anchor="end" font-size="' + (presentation?14:12) + '" fill="' + c.muted + '">' + esc(ctx.today) + '</text>');
  header.push('<text x="' + pad + '" y="' + y + '" font-size="' + (presentation?14:12) + '" fill="' + c.muted + '">' +
    count(components.length, 'component') + ' · ' + count(model.edges.length, 'dependency', 'dependencies') +
    (components.some(node => node.ghost) ? ' · ' + count(components.filter(node => node.ghost).length, 'unplaced component') : '') +
    ' · horizontal positions are current claims</text>');
  y += presentation ? 24 : 20;
  const receipt = comparisonReceipt(diff, pad, y+2, w-pad*2, c, measure, presentation ? 12 : 11);
  header.push(receipt.svg); y += receipt.height;
  y += presentation ? 30 : 22;
  const fieldTop = y;
  const plane = ['<g data-wardley-strategic-field="" data-dependency-projection="" transform="translate(0 ' + fieldTop + ')">',
    '<text x="' + pad + '" y="14" font-size="10" font-weight="700" letter-spacing="1.5" fill="' + c.muted + '">DEPENDENCY PROJECTION ↓ · USER NEEDS ABOVE WHAT THEY NEED</text>'];
  for(const edge of layout.links) plane.push(edgePath(edge, c));
  for(const loop of layout.loopCallouts) plane.push('<g data-loop-callout="' + loop.id + '"><circle cx="' + r(loop.x) + '" cy="' + r(loop.y) + '" r="10" fill="' + c.bg + '" stroke="' + c.err + '" stroke-width="1.4"/><text x="' + r(loop.x+16) + '" y="' + r(loop.y+4) + '" font-size="9" font-weight="700" letter-spacing="1" fill="' + c.err + '">LOOP</text></g>');
  plane.push('<g data-strategic-inventory="" data-components="' + components.length + '" data-dependencies="' + model.edges.length + '">');
  for(const node of layout.nodes){
    if(opts.edit && !presentation && !node.anchor){
      const menu=componentMenu(node, c, w, layout.nodes);
      const bx=Math.min(node.cardX,menu.x-22),by=Math.min(node.y-node.cardH/2,menu.y-22);
      const br=Math.max(node.cardX+node.cardW,menu.x+22),bb=Math.max(node.y+node.cardH/2,menu.y+22);
      /* The bridge is inert hover geometry, not an invisible action: it keeps
         one component's contextual control available while its real 44px
         target remains non-interactive until that component is engaged. */
      plane.push('<g data-strategic-edit-pair=""><rect data-menu-bridge="" aria-hidden="true" x="'+r(bx)+'" y="'+r(by)+'" width="'+r(br-bx)+'" height="'+r(bb-by)+'" fill="'+c.bg+'" fill-opacity="0"/>'+labelPlane(node, relations, c)+menu.svg+'</g>');
    }else plane.push(labelPlane(node, relations, c));
  }
  plane.push('</g>');
  if(opts.edit && !presentation){
    const bottom = Math.max(...layout.nodes.map(node => node.y + node.cardH/2), 34) + 34;
    plane.push('<g data-strategic-add-row=""><rect data-add-bridge="" aria-hidden="true" x="'+pad+'" y="'+(bottom-22)+'" width="'+(w-pad*2)+'" height="44" fill="'+c.bg+'" fill-opacity="0"/>');
    for(const stage of STAGES) plane.push(addZone(stage, bottom, w, pad, c));
    plane.push('</g>');
    layout = {...layout, fieldControlBottom:bottom+28};
  }
  plane.push(ruler(layout, c), '</g>');
  const fieldH = Math.max(layout.h+36, layout.fieldControlBottom || 0, layout.axisY+46);
  const readout = mapReadout(model, layout);
  const readTop = fieldTop + fieldH + (presentation?14:10);
  const read = ['<line x1="' + pad + '" y1="' + readTop + '" x2="' + (w-pad) + '" y2="' + readTop + '" stroke="' + c.border + '"/>'];
  const verdict = svgVerdict({x:pad, y:readTop+(presentation?26:24), width:w-pad*2, line:readout.verdict, fig:readout.fig,
    ink:c.ink, muted:c.muted, brandText:c.ink, font:SANS_SQATTR, measure, size:presentation?24:20,
    scale:presentation?1.1:1, edit:opts.edit&&!presentation ? {raw:model.verdict ?? ''} : undefined});
  read.push(verdict.svg);
  let readY = readTop + (presentation?26:24) + verdict.height - 4;
  for(const flag of readout.flags) for(const line of lines(flag, '12px ' + SANS, w-pad*2, measure)){
    readY += 17;
    read.push('<text x="' + pad + '" y="' + readY + '" font-size="12" fill="' + c.err + '">' + esc(line) + '</text>');
  }
  return {naturalHeight:Math.ceil(readY + (presentation?20:24)), title, body:header.join('')+plane.join('')+read.join('')};
}

function presentationRefusal(model, ctx, reason){
  const c = ctx.colors, measure = ctx.measure, W=1920, pad=84;
  const title = lines(model.title || 'Wardley map', '700 38px ' + SERIF, W-pad*2, measure), shown=title.slice(0,4), hidden=title.length>shown.length;
  const body = ['<rect width="1920" height="1080" fill="' + c.bg + '"/>','<text x="84" y="70" font-size="12" font-weight="700" letter-spacing="1.8" fill="' + c.muted + '">WARDLEY MAP · PRESENTATION REFUSAL</text>'];
  shown.forEach((line,i) => body.push('<text x="84" y="' + (132+i*44) + '" font-family="' + SERIF + '" font-size="38" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'));
  body.push('<line x1="84" y1="360" x2="1836" y2="360" stroke="' + c.border + '"/>','<text x="84" y="420" font-size="24" font-weight="700" fill="' + c.ink + '">COPY PNG UNAVAILABLE</text>','<text x="84" y="464" font-size="18" fill="' + c.muted + '">The complete strategic field would fall below its readable type floor.</text>','<text x="84" y="502" font-size="18" fill="' + c.muted + '">Download SVG for every retained component, dependency and diagnostic.</text>','<text x="84" y="930" font-size="14" font-weight="700" letter-spacing="1.4" fill="' + c.err + '">' + esc(reason) + '</text>','<text x="84" y="1010" font-size="12" fill="' + c.muted + '">' + count(model.components.size, 'COMPONENT') + ' · ' + count(model.edges.length, 'DEPENDENCY', 'DEPENDENCIES') + (hidden ? ' · SOURCE TITLE CONTINUES IN SVG' : '') + '</text>');
  return '<svg xmlns="http://www.w3.org/2000/svg" data-wardley-presentation-refusal="" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="' + SANS + '">' + body.join('') + '</svg>';
}

function renderPresentation(model, ctx, opts){
  const W=1920, pad=72, measure=ctx.measure;
  const layout = layoutMap(model, {measure, intent:'presentation', geom:{w:W, pad, rowGap:96}});
  const field = fieldWide(model, layout, ctx, {...opts, edit:false}, true);
  /* No fit-by-scaling and no “representative spine”: this is the exact
     physical plate. A field that cannot keep 24px verdict / 13px labels above
     the footer explicitly refuses so Copy PNG can return null. */
  if(field.title.length > 2) return presentationRefusal(model, ctx, 'SOURCE TITLE EXCEEDS THE PLATE TITLE POLICY');
  if(field.naturalHeight > 986) return presentationRefusal(model, ctx, 'COMPLETE FIELD EXCEEDS THE 16:9 TYPE FLOOR');
  const c=ctx.colors;
  return '<svg xmlns="http://www.w3.org/2000/svg" data-wardley-presentation="" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="' + SANS + '"><rect width="1920" height="1080" fill="' + c.bg + '"/>' + field.body + '<line x1="72" y1="1022" x2="1848" y2="1022" stroke="' + c.border + '"/><text x="72" y="1054" font-size="12" font-weight="700" letter-spacing="1.3" fill="' + c.muted + '">WARDLEY STRATEGIC FIELD · COMPLETE CURRENT CLAIM · ' + esc(ctx.today || '') + '</text></svg>';
}

function ledgerRow(node, relations, c, measure, W, pad, y, opts){
  const inner=W-pad*2,key=norm(node.name),need=(relations.needs.get(key)||[]).map(relations.label),by=(relations.neededBy.get(key)||[]).map(relations.label),from=relations.ancestors(key);
  const title=lines(node.name,'650 16px '+SANS,inner-70,measure),facts=node.anchor?['USER NEED']:[stageText(node),need.length?'NEEDS · '+need.join(' · '):'NEEDS · —',by.length?'NEEDED BY · '+by.join(' · '):'NEEDED BY · —',from.length?'FROM · '+from.join(' · '):'FROM · —'];
  if(node.ghost)facts.unshift('UNPLACED — TAP RULER TO PLACE');
  const factLines=facts.flatMap(f=>lines(f,'11px '+SANS,inner-28,measure)),h=30+title.length*19+factLines.length*16+(node.anchor?4:32)+18;
  const row=['<g data-strategic-row="'+node.srcLine+'"'+(node.anchor?'':' data-drag="evo" data-strip="" data-name="'+esc(node.name)+'" data-line="'+node.srcLine+'"')+' aria-label="'+esc(node.name+'. '+facts.join('. '))+'">','<rect x="'+pad+'" y="'+y+'" width="'+inner+'" height="'+h+'" fill="'+c.bg+'" stroke="'+(node.ghost?c.muted:c.border)+'" stroke-width="1"'+(node.ghost?' stroke-dasharray="4 3"':'')+'/>'];
  const titleKind=node.anchor?'anchor':'name',titleHitH=Math.max(44,title.length*19+12),titleHitW=Math.max(44,inner-68);
  row.push('<rect data-title-hit="" data-edit="'+titleKind+'" data-line="'+node.srcLine+'" data-raw="'+esc(node.name)+'" x="'+(pad+8)+'" y="'+(y+6)+'" width="'+titleHitW+'" height="'+titleHitH+'" fill="'+c.bg+'" fill-opacity="0" tabindex="0" role="button" aria-label="Rename '+(node.anchor?'user need':'component')+': '+esc(node.name)+'"/>');
  title.forEach((line,index)=>row.push('<text x="'+(pad+14)+'" y="'+(y+25+index*19)+'" font-size="16" font-weight="650" fill="'+(node.ghost?c.muted:c.ink)+'" pointer-events="none">'+esc(line)+'</text>'));
  let factY=y+31+title.length*19;factLines.forEach(f=>{row.push('<text x="'+(pad+14)+'" y="'+factY+'" font-size="11" font-weight="600" fill="'+c.muted+'" pointer-events="none">'+esc(f)+'</text>');factY+=16;});
  if(!node.anchor){const tx=pad+14,tw=inner-28,ty=y+h-22,dot=node.x===null?tx:tx+node.x*tw;row.push('<line x1="'+tx+'" y1="'+ty+'" x2="'+(tx+tw)+'" y2="'+ty+'" stroke="'+c.ink+'" stroke-width="1"/>');for(const stage of STAGES){const sx=tx+stage.mid*tw;row.push('<line x1="'+sx+'" y1="'+(ty-4)+'" x2="'+sx+'" y2="'+(ty+4)+'" stroke="'+c.muted+'" stroke-width="1"/>');}row.push('<rect data-track="" data-x0="'+tx+'" data-w="'+tw+'" x="'+tx+'" y="'+(ty-22)+'" width="'+tw+'" height="44" fill="'+c.bg+'" fill-opacity="0"/><circle data-dot="" cx="'+dot+'" cy="'+ty+'" r="5" fill="'+(node.ghost?c.bg:c.ink)+'" stroke="'+c.ink+'" stroke-width="1.4"'+(node.ghost?' stroke-dasharray="2 2"':'')+'/>');/* Phone has one unambiguous menu plane; exact evolution is edited on the ruler, so a second stage plane would overlap it. */if(opts.edit)row.push('<g data-edit="componentmenu" data-line="'+node.srcLine+'" data-raw="'+esc(node.name)+'" tabindex="0" role="button" aria-label="More options: '+esc(node.name)+'"><rect data-hit="" x="'+(pad+inner-52)+'" y="'+(y+8)+'" width="44" height="44" fill="'+c.bg+'" fill-opacity="0"/><text x="'+(pad+inner-30)+'" y="'+(y+37)+'" text-anchor="middle" font-size="14" font-weight="700" fill="'+c.muted+'" pointer-events="none">⋯</text></g>');}
  row.push('</g>');return {svg:row.join(''),h};
}

function renderNarrow(model, layout, ctx, opts){
  const c=ctx.colors,measure=ctx.measure,W=Math.max(280,Math.round(ctx.width||390)),pad=16,relations=relationIndex(model),diff=strategicDiff(model,opts.compare),parts=[];let y=32;
  for(const line of lines(model.title||'Wardley map','700 22px '+SERIF,W-pad*2,measure)){parts.push('<text x="'+pad+'" y="'+y+'" font-family="'+SERIF+'" font-size="22" font-weight="700" fill="'+c.ink+'">'+esc(line)+'</text>');y+=27;}
  parts.push('<text x="'+pad+'" y="'+y+'" font-size="11" fill="'+c.muted+'">STRATEGIC LEDGER · SOURCE ORDER · DEPENDENCY FACTS</text>');y+=25;
  const receipt=comparisonReceipt(diff,pad,y,W-pad*2,c,measure,11);parts.push(receipt.svg);y+=receipt.height;parts.push('<g data-strategic-ledger="">');
  for(const node of [...layout.nodes].sort(sourceOrder)){const row=ledgerRow(node,relations,c,measure,W,pad,y,opts);parts.push(row.svg);y+=row.h+8;}parts.push('</g>');
  if(opts.edit){parts.push('<g data-edit="additem" data-line="-1" data-raw="" tabindex="0" role="button" aria-label="Add component"><rect x="'+pad+'" y="'+y+'" width="'+(W-pad*2)+'" height="44" fill="none" stroke="'+c.border+'" stroke-dasharray="3 4"/><text x="'+(W/2)+'" y="'+(y+27)+'" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="1.1" fill="'+c.muted+'" pointer-events="none">ADD COMPONENT</text><rect data-hit="" x="'+pad+'" y="'+y+'" width="'+(W-pad*2)+'" height="44" fill="'+c.bg+'" fill-opacity="0"/></g>');y+=60;}
  const read=mapReadout(model,layout,{narrow:true});parts.push('<line x1="'+pad+'" y1="'+y+'" x2="'+(W-pad)+'" y2="'+y+'" stroke="'+c.border+'"/>');const verdict=svgVerdict({x:pad,y:y+24,width:W-pad*2,line:read.verdict,fig:read.fig,ink:c.ink,muted:c.muted,brandText:c.ink,font:SANS_SQATTR,measure,size:17,edit:opts.edit?{raw:model.verdict??''}:undefined});parts.push(verdict.svg);y+=24+verdict.height;for(const flag of read.flags)for(const line of lines(flag,'11px '+SANS,W-pad*2,measure)){y+=16;parts.push('<text x="'+pad+'" y="'+y+'" font-size="11" fill="'+c.err+'">'+esc(line)+'</text>');}
  const H=Math.ceil(y+24);return '<svg xmlns="http://www.w3.org/2000/svg" data-narrow="" data-strategic-ledger="" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" font-family="'+SANS+'"><rect width="'+W+'" height="'+H+'" fill="'+c.bg+'"/>'+parts.join('')+'</svg>';
}

export function toMarkdown(model, layout, href){
  const out=['# '+(model.title||'Wardley map'),'','> Horizontal evolution positions are current strategic claims; vertical order is derived from `A -> B` dependencies, not measured visibility.',''];
  const read=mapReadout(model,layout);if(read.verdict)out.push('**'+read.verdict+'**','');for(const node of [...layout.nodes].filter(node=>!node.anchor).sort(sourceOrder))out.push('- **'+node.name+'** — '+stageText(node));for(const flag of read.flags)out.push('- '+flag);out.push('',count(model.edges.length,'dependency','dependencies')+' · user needs: '+model.anchors.map(anchor=>anchor.name).join(', '),'','[live map]('+href+')');return out.join('\n')+'\n';
}

export function renderMap(model, layout, ctx, opts = {}){
  const intent=opts.intent||ctx.intent||(ctx.width&&ctx.width<NARROW?'live-narrow':'native');
  if(intent==='presentation') return renderPresentation(model,ctx,opts);
  if(intent==='live-narrow'||ctx.width&&ctx.width<NARROW) return renderNarrow(model,layout,ctx,opts);
  const field=fieldWide(model,layout,ctx,opts,false);
  return '<svg xmlns="http://www.w3.org/2000/svg" data-wardley-strategic-field="" width="'+layout.w+'" height="'+field.naturalHeight+'" viewBox="0 0 '+layout.w+' '+field.naturalHeight+'" font-family="'+SANS+'"><rect width="'+layout.w+'" height="'+field.naturalHeight+'" fill="'+ctx.colors.bg+'"/>'+field.body+'</svg>';
}
