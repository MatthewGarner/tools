/* One complete 16:9 causal plate, or an explicit refusal — never a selected path. */
import {esc} from '../assets/svg.js';
import {project} from './project.js';
import {renderCausalField, causalDims, svgInner, causalColours, wrapCausal} from './causal-field.js';
const measureFor = ctx => ctx.measure || (text => String(text).length * 7);
const heading = (model, ctx, size) => wrapCausal(model.title || 'Causal Field', '700 ' + size + 'px sans-serif', 1450, measureFor(ctx));

function titleRefusal(model, ctx, c){
  const title = heading(model, ctx, 42).slice(0, 2);
  return '<svg xmlns="http://www.w3.org/2000/svg" data-causal-presentation="refusal" data-causal-title-refusal="" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1920" height="1080" fill="' + c.bg + '"/>' +
    title.map((line, i) => '<text x="100" y="' + (130 + i * 48) + '" font-size="42" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') +
    '<line x1="100" y1="226" x2="1820" y2="226" stroke="' + c.ink + '" stroke-width="2"/><text x="100" y="322" font-size="16" font-weight="700" letter-spacing="1.7" fill="' + c.err + '">TITLE EXCEEDS THIS COMPLETE CAUSAL FIELD PLATE</text><text x="100" y="388" font-size="25" fill="' + c.ink + '">The native Causal Field retains the full authored title and every claim.</text><text x="100" y="936" font-size="17" fill="' + c.muted + '">COPY PNG HAS NOT CROPPED THE SOURCE · EXPORT THE NATIVE CAUSAL FIELD</text></svg>';
}

function refusal(model, ctx, c, title){
  const name = (model.outcomes[0] && model.outcomes[0].label) || 'the authored tree';
  const lines = wrapCausal(name, '700 34px sans-serif', 1320, measureFor(ctx));
  return '<svg xmlns="http://www.w3.org/2000/svg" data-causal-presentation="refusal" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1920" height="1080" fill="' + c.bg + '"/>' + title.map((line, i) => '<text x="100" y="' + (130 + i * 48) + '" font-size="42" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') + '<line x1="100" y1="226" x2="1820" y2="226" stroke="' + c.ink + '" stroke-width="2"/><text x="100" y="322" font-size="16" font-weight="700" letter-spacing="1.7" fill="' + c.err + '">CANNOT FIT COMPLETE CAUSAL FIELD</text><text x="100" y="384" font-size="25" fill="' + c.ink + '">Copy PNG keeps one complete plate. This tree needs the exhaustive native SVG.</text>' + lines.map((line, i) => '<text x="100" y="' + (480 + i * 46) + '" font-size="34" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') + '<text x="100" y="930" font-size="17" fill="' + c.muted + '">NO PATH HAS BEEN SELECTED OR OMITTED · EXPORT THE NATIVE CAUSAL FIELD</text></svg>';
}

export function renderCausalPresentation(model, ctx, diff = null){
  const c = causalColours(model, ctx), title = heading(model, ctx, 42);
  if(title.length > 2) return titleRefusal(model, ctx, c);
  const diffLines = diff ? wrapCausal(diff.narrative, '600 16px sans-serif', 1480, measureFor(ctx)) : [];
  const chart = renderCausalField(model, project(model), {...ctx, bare:true, edit:false}, diff);
  const d = causalDims(chart), reserve = diffLines.length ? 18 + diffLines.length * 20 : 0, bodyH = 650 - reserve;
  const scale = Math.min(1720 / d.width, bodyH / d.height, 1.25);
  /* 10px source labels never leave the 16:9 plate below a 9px output floor. */
  if(scale < .9) return refusal(model, ctx, c, title);
  const x = 100 + (1720 - d.width * scale) / 2, y = 230 + reserve + (bodyH - d.height * scale) / 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" data-causal-presentation="plate" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1920" height="1080" fill="' + c.bg + '"/>' + title.map((line, i) => '<text x="100" y="' + (124 + i * 44) + '" font-size="38" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>').join('') + '<text x="1820" y="124" text-anchor="end" font-size="17" fill="' + c.muted + '">' + esc(String(ctx.today || '')) + '</text><text x="100" y="210" font-size="14" font-weight="700" letter-spacing="1.8" fill="' + c.muted + '">CAUSAL FIELD · COMPLETE DISCOVERY TREE</text>' + diffLines.map((line, i) => '<text data-causal-presentation-diff="' + i + '" x="100" y="' + (238 + i * 20) + '" font-size="16" font-weight="600" fill="' + c.muted + '">' + esc(line) + '</text>').join('') + '<svg x="' + x + '" y="' + y + '" width="' + (d.width * scale) + '" height="' + (d.height * scale) + '" viewBox="0 0 ' + d.width + ' ' + d.height + '">' + svgInner(chart) + '</svg><line x1="100" y1="1002" x2="1820" y2="1002" stroke="' + c.border + '"/><text x="100" y="1036" font-size="17" font-weight="600" fill="' + c.muted + '">COMPLETE CAUSAL FIELD · NATIVE SVG REMAINS EXHAUSTIVE</text></svg>';
}
