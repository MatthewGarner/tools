/* Checks on the captured artefacts. Each check has an id; a failure that matches a confirmed finding is
   tagged with that finding's id (KNOWN, in known.mjs). */
import {readFileSync, existsSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {measureSvgInPage, checkGeometry, checkSelfContained, checkPicture} from '../pw/export-checks.mjs';
import {analysePngInPage, rasteriseSvgInPage, diffPngInPage, checkMarkdownTables, loadDocs, normText} from './lib.mjs';
import {knownFor} from './known.mjs';

const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
export const svgTexts = svg => [...String(svg).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => normText(unesc(m[1].replace(/<[^>]+>/g, ''))));
const words = s => normText(s).split(/[\s ]+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(w => w.length > 1);
const b64 = f => readFileSync(f).toString('base64');
const decodeHash = url => { try{ const h = new URL(url).hash.slice(1); return h.startsWith('z:') ? JSON.parse(inflateRawSync(Buffer.from(h.slice(2), 'base64url')).toString()) : null; }catch(_){ return null; } };
const r2 = n => Math.round(n * 100) / 100;
const CHROME = /data-edit=|data-add-control|data-select-decision|data-explore|tabindex=|role="button"|cursor:\s*pointer|⋯|class="[^"]*\b(?:hot|is-hover|focus|handle|grip)\b/;

/* the authored strings a document puts on the page, by tool (for "nothing authored is lost") */
function authored(tool, doc){
  if(doc.kind === 'state'){
    const s = doc.state;
    if(tool === 'rank') return s.i.map(r => r[0]);
    if(tool === 'fermi'){ const one = s.a || s; return s.m === 'cf' ? [] : [one.q, one.u, ...Object.keys(one.v || {})].filter(Boolean); }
    return [];
  }
  const lines = doc.source.split('\n').filter(l => l.trim() && !/^\s*\/\//.test(l));
  if(tool === 'bets') return lines.filter(l => /^ {2}\S/.test(l) && /:\s*stake/.test(l)).map(l => l.trim().replace(/:\s*stake[\s\S]*$/, ''))
    .concat(lines.filter(l => /^ {4}kill:/.test(l)).map(l => l.trim().replace(/^kill:\s*/, '').replace(/\s+by \d{4}-\d{2}-\d{2}$/, '')));
  return [];
}

export async function analyse(env, {OUT, tools, docFilter, themes}){
  const page = await (await env.browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  await page.goto(env.srv.base + '/404.html');
  const results = [];
  const add = (ctx, check, pass, values = {}, note = '') => {
    const known = pass === false ? knownFor({...ctx, check, values}) : null;
    results.push({...ctx, check, pass, values, note, known});
  };
  for(const tool of tools){
    const docs = loadDocs(tool);
    for(const doc of docs){
      if(docFilter && !docFilter.some(f => doc.name.includes(f))) continue;
      for(const theme of themes){
        const tdir = join(OUT, 'raw', tool, doc.name, theme);
        if(!existsSync(tdir)) continue;
        for(const view of readdirSync(tdir)){
          const dir = join(tdir, view);
          if(!existsSync(join(dir, 'manifest.json'))) continue;
          const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
          const base = {tool, doc: doc.name, theme, view};
          const liveSvg = existsSync(join(dir, 'live.svg')) ? readFileSync(join(dir, 'live.svg'), 'utf8') : null;
          add({...base, export: 'page'}, 'page:no-script-errors', !(man.errors || []).length, {errors: man.errors});
          for(const [id, ex] of Object.entries(man.exports)){
            const ctx = {...base, export: id};
            const file = ex.kind === 'md' ? join(dir, id + '.md') : ex.kind === 'text' ? join(dir, id + '.txt') : join(dir, id + (ex.kind === 'svg' ? '.svg' : '.png'));
            const has = existsSync(file);
            /* availability: an export that does not succeed must say why, in words that stay */
            const refusalStays = !!(ex.status || '').trim();
            if(!ex.ok){
              const expectedAbsent = ex.hiddenControl === true || ex.error === 'control disabled' || /not found/.test(ex.error || '') || (ex.receipt && ex.hiddenControl) || (id === 'verdict' && ex.hiddenControl && !man.page.verdict);
              add(ctx, 'export:succeeds', expectedAbsent ? null : false, {error: ex.error, refusal: ex.refusal, label: ex.label, hiddenControl: ex.hiddenControl, status: ex.status, prompted: ex.prompted != null},
                expectedAbsent ? 'control absent or disabled for this document (informational)' : 'the control was enabled and pressed; nothing arrived');
              if(ex.refusal) add(ctx, 'export:refusal-stays', refusalStays, {refusal: ex.refusal, status: ex.status}, 'E7: a refusal is stated in a status line that stays, not only a label that reverts');
              continue;
            }
            add(ctx, 'export:succeeds', true, {suggested: ex.suggested});
            if(ex.hiddenControl && !ex.receipt) add(ctx, 'export:control-visible', false, {sel: ex.sel}, 'the export worked, but its control is not visible in this view');
            if(ex.kind === 'svg') await checkSvg(page, add, ctx, file, {liveSvg, theme, man, tool, doc, dir, id});
            if(ex.kind === 'png' || ex.kind === 'copypng') await checkPng(page, add, ctx, file, {dir, id, theme, man, ex});
            if(ex.kind === 'md') checkMd(add, ctx, readFileSync(file, 'utf8'), {tool, doc, man, liveSvg});
            if(ex.kind === 'text') checkText(add, ctx, readFileSync(file, 'utf8'), {tool, man});
            if(ex.canvasText) checkCanvas(add, ctx, ex.canvasText, {man, doc});
          }
          /* copy PNG and download PNG are the same picture */
          const dl = join(dir, 'png.png'), cp = join(dir, 'copypng.png');
          if(existsSync(dl) && existsSync(cp)){
            const d = await page.evaluate(diffPngInPage, [b64(dl), b64(cp), 24]);
            add({...base, export: 'copypng'}, 'png:copy-equals-download', !d.sizeMismatch && d.ratio < .001, d, 'P4: Copy PNG copies the picture Download PNG gives');
          }
          if(man.share) checkShare(add, {...base, export: 'share'}, man.share, dir, doc, tool);
        }
      }
    }
  }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  /* print */
  const lines = [];
  for(const r of results){
    if(r.pass === null) continue;
    lines.push(`${r.pass ? 'PASS' : 'FAIL'} ${r.tool}/${r.doc}/${r.theme}/${r.view} ${r.export} ${r.check}${r.pass ? '' : r.known ? ' [known ' + r.known + ']' : ' [NEW]'}${r.pass ? '' : ' ' + JSON.stringify(r.values).slice(0, 260)}`);
  }
  const fails = results.filter(r => r.pass === false), unknown = fails.filter(r => !r.known);
  lines.push(`\nchecks ${results.filter(r => r.pass !== null).length}  pass ${results.filter(r => r.pass).length}  fail ${fails.length} (known ${fails.length - unknown.length}, new ${unknown.length})`);
  const byCheck = {};
  for(const f of fails) byCheck[f.tool + ' ' + f.check] = (byCheck[f.tool + ' ' + f.check] || 0) + 1;
  lines.push(Object.entries(byCheck).sort().map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  console.log(lines.join('\n'));
  writeFileSync(join(OUT, 'audit-output.txt'), lines.join('\n'));
}

async function checkSvg(page, add, ctx, file, {liveSvg, theme, man, tool, doc, dir, id}){
  const svg = readFileSync(file, 'utf8');
  /* measure the SVG opened alone, as a viewer would */
  const p2 = await page.context().newPage();
  let geo;
  try{
    await p2.goto(pathToFileURL(file).href);
    geo = await p2.evaluate(measureSvgInPage, null);
  }catch(e){ add(ctx, 'svg:opens-standalone', false, {error: e.message.split('\n')[0]}); await p2.close(); return; }
  await p2.close();
  add(ctx, 'svg:opens-standalone', true, {viewBox: geo.viewBox});
  for(const c of checkGeometry(geo, svg)){
    if(c.check === 'truncation') add(ctx, 'svg:truncation', !c.unrecoverableFail, c.values, c.note);
    else if(['orphans', 'hairlines', 'theme:root-background'].includes(c.check)) add(ctx, 'svg:' + c.check, null, c.values, c.note);
    else add(ctx, 'svg:' + c.check, c.pass, c.values, c.note);
  }
  for(const c of checkSelfContained(svg, geo)) add(ctx, 'svg:' + c.check, c.check === 'self-contained:user-links' ? null : c.pass, c.values, c.note);
  for(const c of checkPicture(geo)) if(c.check === 'picture:margins') add(ctx, 'svg:margins', c.pass, c.values, c.note);
  const chrome = svg.match(CHROME);
  add(ctx, 'svg:no-editing-chrome', !chrome, {match: chrome ? chrome[0] : null}, 'no edit hooks, add controls, ⋯ menus, focus or hover state in an export');
  /* theme */
  const bgRect = geo.shapes.filter(s => s.tag === 'rect' && s.fill && s.fill[3] > .5).sort((a, b) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]))[0];
  const lum = bgRect ? (.2126 * bgRect.fill[0] + .7152 * bgRect.fill[1] + .0722 * bgRect.fill[2]) / 255 : null;
  const tone = lum === null ? 'transparent' : lum < .4 ? 'dark' : 'light';
  add(ctx, 'svg:theme-matches-page', tone === theme, {tone, theme, background: bgRect?.fill}, 'the export is in the theme the page is in, with an opaque background');
  /* mirrors the view: every word of the live artefact appears in the export */
  if(liveSvg && !id.includes('receipt') && !id.startsWith('agenda') && !id.startsWith('closeout')){
    const exportWords = new Set(words(svgTexts(svg).join(' ')));
    const liveWords = words(svgTexts(liveSvg).filter(t => t !== '⋯' && t !== '+').join(' '));
    /* a word the live view cut short ("customers_…") is mirrored by the longer word it stands for, whatever face each is set in */
    const cutPrefixes = [...new Set(svgTexts(liveSvg).flatMap(t => t.split(/\s+/)).filter(w => /…$/.test(w)).map(w => w.replace(/[^\p{L}\p{N}]+$/gu, '')))];
    const exportList = [...exportWords];
    const missing = [...new Set(liveWords.filter(w => !exportWords.has(w) && !(cutPrefixes.includes(w) && exportList.some(e => e.startsWith(w)))))];
    add(ctx, 'svg:mirrors-live-words', missing.length === 0, {missing: missing.slice(0, 30), count: missing.length}, 'every word drawn in the live view is in the export (wrapping may differ)');
  }
  /* Fermi: the driver tree is headed by the question (XF-14); a comparison export describes both variants (XF-7) */
  if(tool === 'fermi' && ctx.view === 'tree' && doc.state && (doc.state.q || doc.state.a?.q)){
    const q = normText(doc.state.q || doc.state.a.q), all = normText(svgTexts(svg).join(' '));
    add(ctx, 'svg:fermi-tree-titled', all.includes(q.slice(0, 20)) || words(q).slice(0, 3).every(w => all.includes(w)), {question: q.slice(0, 60)}, 'XF-14: the question heads the driver-tree export');
  }
  if(tool === 'fermi' && ctx.view === 'dist' && doc.state?.a && doc.state?.b){
    const all = svgTexts(svg).join(' '), fa = (doc.state.a.f || '').trim(), fb = (doc.state.b.f || '').trim();
    add(ctx, 'svg:fermi-variants-described', all.includes('Variant A: ' + fa) && all.includes('Variant B: ' + fb), {a: fa, b: fb}, 'XF-7: the comparison picture describes both A and B');
  }
  /* authored strings present */
  const auth = (tool === 'bets' && ctx.view !== 'board') ? [] : authored(tool, doc);
  if(auth.length){
    const all = normText(svgTexts(svg).join(' '));
    const lost = auth.filter(a => !all.includes(normText(a)) && !words(a).every(w => all.includes(w)));
    add(ctx, 'svg:authored-present', tool === 'fermi' ? (lost.length ? null : true) : lost.length === 0, {lost: lost.slice(0, 10)}, 'every authored name and kill criterion reaches the export, in full');
  }
}

async function checkPng(page, add, ctx, file, {dir, id, theme, man, ex}){
  const st = await page.evaluate(analysePngInPage, b64(file));
  add(ctx, 'png:decodes', st.w > 0, {w: st.w, h: st.h});
  add(ctx, 'png:opaque', st.minAlpha === 255, {minAlpha: st.minAlpha}, 'no transparency: a transparent PNG pasted on a dark slide loses its ink');
  const tone = st.meanLum / 255 < .4 ? 'dark' : 'light';
  add(ctx, 'png:theme-matches-page', tone === theme, {tone, theme, meanLum: r2(st.meanLum)});
  if(st.margins){
    const m = st.margins;
    add(ctx, 'png:margins-symmetric', Math.abs(m.left - m.right) <= Math.max(6, st.w * .006), {margins: m, w: st.w, h: st.h}, 'P1: ink left margin equals right margin');
    add(ctx, 'png:ink-off-edge', m.left > 1 && m.right > 1 && m.top > 1 && m.bottom > 1, {margins: m}, 'no ink touching the edge of the picture');
  }
  if(id === 'copypng') add(ctx, 'png:copy-aspect', null, {ratio: r2(st.w / st.h)}, 'informational: aspect of Copy PNG');
  /* PNG is the SVG it sits beside, rasterised */
  const svgId = id === 'png' ? 'svg' : id.replace(/-png$/, '-svg');
  const svgFile = join(dir, svgId + '.svg');
  if(id !== 'copypng' && existsSync(svgFile)){
    const svg = readFileSync(svgFile, 'utf8');
    const w = +(svg.match(/<svg[^>]*\swidth="([\d.]+)"/) || [])[1], h = +(svg.match(/<svg[^>]*\sheight="([\d.]+)"/) || [])[1];
    const sx = w ? st.w / w : null;
    add(ctx, 'png:scale-2x', sx !== null && Math.abs(sx - 2) < .02, {svg: [w, h], png: [st.w, st.h], scale: sx && r2(sx)}, 'P3: PNG is the SVG at 2x unless 2x passes the canvas limit');
    if(sx){
      const ref = await page.evaluate(rasteriseSvgInPage, [svg, sx]).catch(e => ({error: e.message}));
      if(ref.b64){
        const d = await page.evaluate(diffPngInPage, [b64(file), ref.b64, 40]);
        add(ctx, 'png:matches-svg', !d.sizeMismatch && d.ratio < .01, d, 'the PNG is the downloaded SVG rasterised at the same scale (1% of pixels may differ by antialiasing)');
      }
    }
  }
}

function checkMd(add, ctx, md, {tool, doc, man, liveSvg}){
  const probs = checkMarkdownTables(md);
  add(ctx, 'md:tables-valid', probs.length === 0, {problems: probs.slice(0, 8)}, 'every table row has the header\'s cell count (an unescaped pipe in a cell adds a column)');
  const raw = /<(?!https?:)[a-z\/][^>]*>/i.exec(md.replace(/\\[\\|*_`\[\]<>]/g, ''));   // a backslash-escaped < or > is not markup
  add(ctx, 'md:no-raw-html', !raw, {match: raw?.[0]}, 'authored < > reach Markdown escaped, not as live HTML');
  const unesc = md.replace(/\\([|*_`\[\]<>\\#])/g, '$1');
  const auth = authored(tool, doc);
  if(auth.length){
    const flat = normText(unesc);
    const lost = auth.filter(a => !flat.includes(normText(a)));
    add(ctx, 'md:authored-present', lost.length === 0, {lost: lost.slice(0, 10)}, 'every authored name reaches the Markdown verbatim');
  }
  const emph = [...md.matchAll(/(?<![\\*\w])\*(?!\*)[^*\n]+\*(?!\*)|(?<![\\\w])_[^_\n]+_(?!\w)/g)].map(m => m[0]).filter(s => !/^_\S.*\S_$/.test(s) || true);
  if(tool === 'rank' || tool === 'bets') add(ctx, 'md:markdown-specials-escaped', !auth.some(a => /[*_`\[\]]/.test(a) && md.includes(a) && !md.includes(a.replace(/([*_`\[\]])/g, '\\$1'))), {}, 'authored * _ ` [ ] are escaped so a name is not reformatted');
  const link = (md.match(/\]\((https?:[^)]+)\)/) || [])[1];
  if(link){
    const st = decodeHash(link);
    const ok = doc.kind === 'source' ? st && normText(st.t) === normText(doc.source) : !!st;
    add(ctx, 'md:link-reopens-model', !!ok, {decoded: !!st, sameSource: ok}, 'the live-model link in the Markdown carries this model');
  }
  /* figures */
  if(tool === 'fermi' && man.page.tiles && ctx.view !== 'cf'){
    const t = man.page.tiles;
    const want = [t.p10, t.p50, t.p90].map(s => normText(s));
    const missing = want.filter(v => v && !md.includes(v));
    add(ctx, 'md:figures-match-page', missing.length === 0, {tiles: want, missing}, 'P10, P50 and P90 in the Markdown are the page\'s, same rounding');
  }
  if(tool === 'rank' && man.page.rank){
    const rows = md.split('\n').filter(l => /^\| \d+ \|/.test(l)).map(l => l.split(/(?<!\\)\|/).map(c => c.trim()));
    const page = man.page.rank.rows;
    const mism = [];
    rows.forEach((r, i) => {
      const pr = page[i] || '';
      const pct = r[5];
      const pageTop = (pr.match(/top-\d+\s*(\S+)/) || [])[1];
      if(pageTop && pct && pageTop !== pct.replace(/\s/g, '')) mism.push({row: i + 1, md: pct, page: pageTop});
      const name = r[2].replace(/\\(.)/g, '$1');
      if(!normText(pr).includes(normText(name))) mism.push({row: i + 1, mdName: name, page: pr.slice(0, 80)});
    });
    add(ctx, 'md:figures-match-page', mism.length === 0 && rows.length === page.length, {mdRows: rows.length, pageRows: page.length, mismatches: mism.slice(0, 10)}, 'the table has every row of the page in the same order with the same P(top-k)');
  }
  if(tool === 'bets' && liveSvg && ctx.view === 'board'){
    const live = new Set(svgTexts(liveSvg).flatMap(t => t.match(/[−+-]?\d[\d,.]*%?/g) || []).map(s => s.replace('-', '−')));
    const mdNums = [...md.replace(/\[Open in bets\]\([^)]*\)/, '').replace(/\d{4}-\d{2}-\d{2}/g, '').matchAll(/[−+]\d[\d,.]*/g)].map(m => m[0]);
    const missing = [...new Set(mdNums.filter(n => !live.has(n)))];
    add(ctx, 'md:figures-on-page', missing.length === 0, {missing: missing.slice(0, 20)}, 'every signed figure in the Markdown is drawn on the page');
  }
}

function checkText(add, ctx, txt, {tool, man}){
  if(ctx.export === 'verdict' && man.page.verdict){
    const line = normText(man.page.verdict.replace(/^Verdict\s*/i, ''));
    add(ctx, 'text:verdict-equals-page', normText(txt) === line.replace(/\s*Copy$/, ''), {copied: txt.slice(0, 200), page: line.slice(0, 200)});
  }
  if(ctx.export === 'summary' && man.page.tiles){
    const t = man.page.tiles;
    const missing = [t.p10, t.p50, t.p90].map(normText).filter(v => v && !txt.includes(v));
    add(ctx, 'text:summary-figures-match-page', missing.length === 0, {missing, txt: txt.slice(0, 300)});
  }
}

function checkCanvas(add, ctx, calls, {man, doc}){
  /* lines drawn on the receipt canvas; a row that wrapped continues at y + size + 6 */
  const lines = calls.filter(c => c.text !== '');
  const mid = [];
  for(let i = 1; i < lines.length; i++){
    const a = lines[i - 1], b = lines[i];
    const size = parseFloat((a.font.match(/(\d+(?:\.\d+)?)px/) || [])[1]);
    if(a.font === b.font && Math.abs(b.y - a.y - (size + 6)) < .5 && /[\p{L}\p{N}]$/u.test(a.text) && /^[\p{L}\p{N}]/u.test(b.text))
      mid.push({end: a.text.slice(-25), start: b.text.slice(0, 25)});
  }
  add(ctx, 'canvas:no-mid-word-wrap', mid.length === 0, {count: mid.length, hits: mid.slice(0, 8)}, 'wrapped receipt lines break between words');
  const fams = [...new Set(lines.map(l => l.font.replace(/^[\d\s]*\d+(?:\.\d+)?px\s*/, '').replace(/^\d+ /, '')))];
  add(ctx, 'canvas:house-font', !fams.some(f => /-apple-system|BlinkMacSystemFont/.test(f)), {fonts: fams}, 'the receipt is set in the page\'s typefaces, not the viewer\'s system font');
  const text = lines.map(l => l.text).join('\n');
  const t = man.page.tiles || {};
  const missing = [t.p10, t.p50, t.p90].map(normText).filter(v => v && !text.includes(v));
  add(ctx, 'canvas:figures-match-page', missing.length === 0, {missing}, 'P10/P50/P90 on the PNG are the page\'s');
  const pageVerdict = normText((man.page.verdict || '').replace(/^Verdict\s*/i, ''));
  add(ctx, 'canvas:mirrors-view', null, {lines: lines.length, hasVerdict: pageVerdict ? text.includes(pageVerdict.slice(1, 20)) : null, hasResearch: /worth researching/i.test(text)}, 'informational: what of the view the receipt carries');
}

function checkShare(add, ctx, sh, dir, doc, tool){
  add(ctx, 'share:link-copied', !!sh.url && /^http/.test(sh.url), {status: sh.status, urlLength: sh.urlLength, error: sh.error});
  if(!sh.url) return;
  if(!sh.reexport) return;
  const a = join(dir, sh.reexportId + (sh.reexportId === 'md' ? '.md' : '.svg')), b = join(dir, 'share-' + sh.reexportId + (sh.reexportId === 'md' ? '.md' : '.svg'));
  if(!existsSync(a) && !existsSync(b)){ add(ctx, 'share:same-export', null, {reason: 'no export on either side (export unavailable for this document)'}); return; }
  if(!existsSync(a) || !existsSync(b)){ add(ctx, 'share:same-export', false, {reason: 'missing re-export', reexport: sh.reexport}); return; }
  let A = readFileSync(a, 'utf8'), B = readFileSync(b, 'utf8');
  if(sh.reexportId === 'md'){ A = A.replace(/\]\([^)]*\)/g, ']()'); B = B.replace(/\]\([^)]*\)/g, ']()'); }
  let firstDiff = -1; for(let i = 0; i < Math.max(A.length, B.length); i++) if(A[i] !== B[i]){ firstDiff = i; break; }
  add(ctx, 'share:same-export', A === B, {firstDiff, a: firstDiff >= 0 ? A.slice(Math.max(0, firstDiff - 60), firstDiff + 80) : '', b: firstDiff >= 0 ? B.slice(Math.max(0, firstDiff - 60), firstDiff + 80) : ''}, 'the shared link reopens to the same export, byte for byte');
}
