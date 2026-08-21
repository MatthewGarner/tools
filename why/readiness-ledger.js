/* Readiness ledger rendered directly from Why's derived projection. */
import {esc, btnAttrs} from '../assets/svg.js';
import {causalNodes, causalColours, wrapCausal} from './causal-field.js';

const heading = {delivering:'DELIVERING', testing:'TESTING', unaddressed:'UNADDRESSED'};
const measureFallback = text => String(text || '').length * 7;

function C(model, ctx){ return causalColours(model, ctx); }
function semanticName(entry){
  const status = entry.node.status ? ' · ' + String(entry.node.status).toUpperCase() : '';
  return entry.stage + ' · ' + entry.trail.map(node => node.label).join(' › ') + status;
}
function menu(entry, edit){
  return edit ? ' data-edit="cardmenu-' + entry.stage + '" data-line="' + entry.node.srcLine +
    '" data-raw="" data-menu=""' + btnAttrs('More options: ' + semanticName(entry)) : '';
}
function name(entry, edit){
  return edit ? ' data-edit="label" data-line="' + entry.node.srcLine + '" data-raw="' +
    esc(entry.node.label) + '"' + btnAttrs('Rename: ' + semanticName(entry)) : '';
}

function row(svg, item, x, w, y, ctx, colours, diff){
  const {entry, column, audit = []} = item, n = entry.node;
  const context = entry.trail.map(node => node.label).join(' → ');
  const path = entry.trail.slice(0, -1).map(node => node.label).join(' → ');
  const pathLines = path ? wrapCausal(path, '400 10px sans-serif', w - 12, ctx.measure || measureFallback) : [];
  const lines = wrapCausal(n.label, '600 15px sans-serif', w - 12, ctx.measure || measureFallback);
  const broken = audit.includes('BROKEN ASSUMPTION');
  const change = diff && diff.badge(n);
  const changeLabel = change ? String(change.label).toUpperCase() : '';
  const h = Math.max(44, 11 + pathLines.length * 15 + lines.length * 18 + (audit.length ? 15 : 0) + (change ? 15 : 0) + 10);
  svg.push('<g data-readiness-node="' + n.srcLine + '" data-line="' + n.srcLine + '" data-readiness-column="' + column + '" data-readiness-context="' + esc(context) + '">');
  if(ctx.edit) svg.push('<rect' + menu(entry, true) + ' data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="transparent" pointer-events="all"/>');
  let ty = y + 14;
  for(const line of pathLines){ svg.push('<text pointer-events="none" x="' + x + '" y="' + ty + '" font-size="10" fill="' + colours.muted + '">' + esc(line) + '</text>'); ty += 15; }
  lines.forEach((line, index) => { svg.push('<text' + (ctx.edit && index === 0 ? name(entry, true) : ' pointer-events="none"') + ' x="' + x + '" y="' + ty + '" font-size="15" font-weight="600" fill="' + colours.ink + '">' + esc(line) + '</text>'); ty += 18; });
  if(audit.length) svg.push('<text data-readiness-audit="' + esc(audit[0].toLowerCase()) + '" pointer-events="none" x="' + x + '" y="' + ty + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + (broken ? colours.err : colours.muted) + '">' + esc(audit[0]) + '</text>');
  if(audit.length) ty += 15;
  if(change) svg.push('<text data-readiness-diff="' + esc(change.kind) + '" pointer-events="none" x="' + x + '" y="' + ty + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + colours.muted + '">' + esc(changeLabel) + '</text>');
  svg.push('<line x1="' + x + '" y1="' + (y + h - 1) + '" x2="' + (x + w) + '" y2="' + (y + h - 1) + '" stroke="' + colours.border + '"/></g>');
  return y + h + 10;
}

export function renderReadinessLedger(model, projection, ctx, diff = null){
  const colours = C(model, ctx), all = causalNodes(model), byNode = new Map(all.map(entry => [entry.node, entry]));
  const noWhy = new Set(projection.noWhy.map(item => item.node));
  const records = [
    ...projection.now.map(item => ({entry:byNode.get(item.node), column:'delivering', audit:projection.audits.get(item.node) || []})),
    ...projection.next.map(item => ({entry:byNode.get(item.node), column:'testing', audit:projection.audits.get(item.node) || []})),
    ...projection.later.map(item => ({entry:byNode.get(item.node), column:'unaddressed', audit:[]})),
  ].filter(item => item.entry && !noWhy.has(item.entry.node));
  const integrity = projection.noWhy.map(item => ({entry:byNode.get(item.node), column:'no-why', audit:projection.audits.get(item.node) || []})).filter(item => item.entry);
  const narrow = !!(ctx.width && ctx.width < 520), W = narrow ? ctx.width : 1216, pad = narrow ? 22 : 44;
  const starts = narrow ? [pad] : [44, 392, 740], colW = narrow ? W - pad * 2 : 300;
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" data-readiness-ledger="why" data-readiness-layout="' +
    (narrow ? 'stack' : 'ledger') + '" role="' + (ctx.edit ? 'group' : 'img') + '" aria-label="Delivery Lens, derived discovery readiness" width="' + W +
    '" height="HEIGHT" viewBox="0 0 ' + W + ' HEIGHT" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="' + W + '" height="HEIGHT" fill="' + colours.bg + '"/>'];
  let y = ctx.bare ? 28 : 34;
  if(!ctx.bare){
    const titleLines = wrapCausal(model.title || 'Untitled discovery', (narrow ? '700 22px' : '700 27px') + ' sans-serif', W - pad * 2, ctx.measure || measureFallback);
    titleLines.forEach(line => { out.push('<text x="' + pad + '" y="' + y + '" font-size="' + (narrow ? 22 : 27) + '" font-weight="700" fill="' + colours.ink + '">' + esc(line) + '</text>'); y += narrow ? 27 : 31; });
    if(narrow){
      out.push('<text x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.3" fill="' + colours.muted + '">DELIVERY LENS · DERIVED READINESS</text>');
      y += 13;
      out.push('<text x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.3" fill="' + colours.muted + '">NOT DELIVERY TIME</text>');
      y += 32;
    } else {
      out.push('<text x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.3" fill="' + colours.muted + '">DELIVERY LENS · DERIVED READINESS, NOT DELIVERY TIME</text>');
      y += 32;
    }
  }
  if(diff && !ctx.bare){
    const comparisonLines = wrapCausal(diff.narrative, '600 11px sans-serif', W - pad * 2, ctx.measure || measureFallback);
    out.push('<g data-readiness-comparison="active">');
    comparisonLines.forEach((line, index) => {
      out.push('<text pointer-events="none" x="' + pad + '" y="' + y + '" font-size="11" font-weight="600" fill="' + colours.muted + '">' + esc(index === 0 ? 'COMPARE · ' + line : line) + '</text>');
      y += 16;
    });
    out.push('</g>'); y += 12;
  }
  if(narrow){
    for(const column of Object.keys(heading)){
      out.push('<text data-readiness-column="' + column + '" x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + colours.muted + '">' + heading[column] + '</text><line x1="' + pad + '" y1="' + (y + 10) + '" x2="' + (W - pad) + '" y2="' + (y + 10) + '" stroke="' + colours.border + '"/>');
      y += 27; for(const record of records.filter(record => record.column === column)) y = row(out, record, pad, colW, y, ctx, colours, diff); y += 12;
    }
  } else {
    Object.keys(heading).forEach((column, index) => out.push('<text data-readiness-column="' + column + '" x="' + starts[index] + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + colours.muted + '">' + heading[column] + '</text><line x1="' + starts[index] + '" y1="' + (y + 10) + '" x2="' + (starts[index] + colW) + '" y2="' + (y + 10) + '" stroke="' + colours.border + '"/>'));
    y += 31; const ends = Object.keys(heading).map((column, index) => { let yy = y; for(const record of records.filter(record => record.column === column)) yy = row(out, record, starts[index], colW, yy, ctx, colours, diff); return yy; }); y = Math.max(...ends) + 20;
  }
  if(integrity.length){
    out.push('<text data-readiness-column="no-why" x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + colours.ink + '">NO WHY</text><text data-readiness-integrity="exception" x="' + (pad + 82) + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + colours.muted + '">INTEGRITY EXCEPTION</text><line x1="' + pad + '" y1="' + (y + 10) + '" x2="' + (W - pad) + '" y2="' + (y + 10) + '" stroke="' + colours.border + '"/>');
    y += 28; for(const record of integrity) y = row(out, record, pad, W - pad * 2, y, ctx, colours, diff); y += 8;
  }
  if(diff && diff.dropped.length){
    const dropped = wrapCausal(diff.dropped.join(' · '), '600 10px sans-serif', W - pad * 2 - 72, ctx.measure || measureFallback);
    dropped.forEach((line, index) => { out.push('<text data-readiness-dropped="' + index + '" pointer-events="none" x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + colours.muted + '">' + esc(index === 0 ? 'DROPPED · ' + line : line) + '</text>'); y += 15; });
    y += 8;
  }
  out.push('<g data-readiness-excluded="candidate"/><g data-readiness-excluded="shipped"/><g data-readiness-excluded="parked"/><text x="' + pad + '" y="' + y + '" font-size="10" fill="' + colours.muted + '">EXCLUDED FROM DERIVED READINESS · CANDIDATE / SHIPPED / PARKED</text>');
  return out.join('').replaceAll('HEIGHT', String(Math.ceil(y + 28))) + '</svg>';
}
