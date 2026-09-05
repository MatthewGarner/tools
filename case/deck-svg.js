/* Pure paint of the Case export plan. App code may embed the suite's local fonts
   before rasterisation or saving; no screenshot/DOM export path is involved. */
import {esc} from '../assets/svg.js';
import {chapterColors} from '../roadmap/chapter-colors.js';
import {embedFontCSS} from '../roadmap/chapter-fonts.js';
import {exportCasePages} from './export-pages.js';
import {classifyReference} from './parse.js';
const e=value=>esc(String(value??''));
// Relative suite URLs must still navigate when the SVG is opened from disk.
const safeHref=value=>classifyReference(value).safe ? (value.startsWith('/')?'https://tools.matthewgarner.me'+value:value) : null;
export function renderCaseDeckPage(page,model,ctx={}) {
  const C=chapterColors({...model,...(!model.palette&&!model.accent?{accent:'#526F65'}:{})},{...ctx,dark:ctx.dark??model.theme==='dark'});
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" data-case-deck="" data-page="${page.index+1}" role="img">`,
    `<title>${e(model.title||'Case')} — ${e(page.section)}${page.continued?' (continued)':''}</title>`,
    `<rect width="${page.width}" height="${page.height}" fill="${C.bg}"/>`,
    `<text x="72" y="76" font-family="DM Sans" font-size="16" font-weight="600" fill="${C.accent}">CASE / ${e(page.section.toUpperCase())}${page.continued?' · CONTINUED':''}</text>`];
  for(const r of page.rules)out.push(`<line x1="${r.x}" y1="${r.y}" x2="${r.x2}" y2="${r.y2}" stroke="${C[r.role]||C.border}"/>`);
  for(const b of page.blocks){
    const href=safeHref(b.href);
    if(href)out.push(`<a href="${e(href)}" target="_blank" rel="noopener"><title>${e(b.href)}</title>`);
    out.push(`<g data-source-field="${e(b.key||'')}"${b.href?` data-source-url="${e(b.href)}"`:''}>`);
    b.lines.forEach((line,i)=>out.push(`<text x="${b.x}" y="${b.y+b.size+i*b.step}" font-family="${e(b.family)}" font-size="${b.size}" font-weight="${b.weight}" fill="${href?C.accent:C[b.role]||C.ink}">${e(line)}</text>`));
    out.push('</g>');if(href)out.push('</a>');
  }
  out.push(`<line x1="72" y1="833" x2="1528" y2="833" stroke="${C.border}"/>`,
    `<text x="72" y="864" font-family="DM Sans" font-size="16" fill="${C.muted}">${e(page.sourceTitle)}</text>`,
    `<text x="1528" y="864" text-anchor="end" font-family="DM Sans" font-size="16" fill="${C.muted}">${page.index+1} / ${page.total}</text>`,'</svg>');
  const svg=out.join('');return ctx.fontCSS?embedFontCSS(svg,ctx.fontCSS):svg;
}
export function buildCaseDeck(model,ctx={}) {
  const plan=exportCasePages(model,ctx);
  return {...plan,pages:plan.pages.map(page=>({...page,svg:renderCaseDeckPage(page,model,ctx)}))};
}
