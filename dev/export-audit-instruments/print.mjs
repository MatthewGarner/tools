/* Print: what the browser's Print gives for each tool (Chromium's PDF, A4, the page's own print CSS).
     node dev/export-audit-instruments/print.mjs [--tool bets] [--doc a0] [--out <dir>]
   Rasterises each PDF page with pdftoppm and reads its text with pdftotext; prints a PASS/FAIL line per check. */
import {writeFileSync, readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {arg, asList, boot, newContext, loadDocs, ensure, CANVAS_SPY, normText} from './lib.mjs';
import {svgTexts} from './analyse.mjs';
import {TOOLS} from './tools.mjs';
import {knownFor} from './known.mjs';

const OUT = arg('out', '/Users/matthew/repos/tools/docs/superpowers/specs/export-audit-instruments');
const tools = asList(arg('tool')) || Object.keys(TOOLS);
const docFilter = asList(arg('doc')) || ['a0', 'a-example', 'many', 'long'];
const CHROME_WORDS = /\b(Copy PNG|Copy as markdown|Copy summary|Export|Share|Undo|Edit formula|Add initiative|Paste from spreadsheet|Syntax reference|More views|Replay the maths)\b/i;

const env = await boot();
const lines = [], results = [];
const add = (ctx, check, pass, values) => { const known = pass === false ? knownFor({...ctx, check, values}) : null; results.push({...ctx, check, pass, values, known});
  lines.push(`${pass ? 'PASS' : 'FAIL'} ${ctx.tool}/${ctx.doc}/${ctx.theme}/${ctx.view} print ${check}${pass ? '' : known ? ' [known ' + known + ']' : ' [NEW]'}${pass ? '' : ' ' + JSON.stringify(values).slice(0, 240)}`); };
try{
  for(const tool of tools){
    const T = TOOLS[tool];
    for(const doc of loadDocs(tool)){
      if(!docFilter.some(f => doc.name.includes(f))) continue;
      for(const theme of ['light', 'dark']){
        const ctx = await newContext(env.browser, env.srv.base, theme);
        await ctx.addInitScript(CANVAS_SPY);
        const page = await ctx.newPage();
        await page.goto(env.srv.base + T.path + '#' + T.hash(doc), {waitUntil: 'load'});
        await T.ready(page);
        const view = T.views(doc)[0];
        await T.select(page, view);
        const dir = ensure(join(OUT, 'print', tool, doc.name, theme));
        const pdf = join(dir, 'print.pdf');
        await page.emulateMedia({media: 'print'});
        await page.pdf({path: pdf, format: 'A4', printBackground: true});
        await ctx.close();
        for(const f of readdirSync(dir)) if(/^page-\d+\.png$/.test(f)) execFileSync('rm', [join(dir, f)]);
        execFileSync('pdftoppm', ['-r', '60', '-png', pdf, join(dir, 'page')]);
        const pages = readdirSync(dir).filter(f => /^page-\d+\.png$/.test(f)).sort();
        const text = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
        writeFileSync(join(dir, 'print.txt'), text);
        const c = {tool, doc: doc.name, theme, view};
        const chrome = text.match(CHROME_WORDS);
        add(c, 'print:artefact-alone', !chrome, {pages: pages.length, chromeWord: chrome?.[0]});
        add(c, 'print:pages', pages.length <= 2, {pages: pages.length});
        /* the artefact is on paper whole: every word of the downloaded SVG for this view is in the PDF's text */
        const svgFile = join(OUT, 'raw', tool, doc.name, theme, view, 'svg.svg');
        if(existsSync(svgFile)){
          const ws = s => new Set(normText(s).split(' ').map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(w => w.length > 2));
          const svgWords = ws(svgTexts(readFileSync(svgFile, 'utf8')).join(' ')), printed = ws(text);
          const missing = [...svgWords].filter(w => !printed.has(w));
          add(c, 'print:artefact-complete', missing.length <= svgWords.size * .02, {missing: missing.slice(0, 20), count: missing.length, of: svgWords.size});
        }
        /* how dark is page 1? a dark artefact printed on paper wastes ink and loses contrast */
        const stat = execFileSync('python3', ['-c', `from PIL import Image,ImageStat;im=Image.open(${JSON.stringify(join(dir, pages[0]))}).convert('L');print(ImageStat.Stat(im).mean[0])`]).toString().trim();
        add(c, 'print:light-on-paper', +stat > 170, {meanGrey: +stat});
      }
    }
  }
}finally{ await env.close(); }
lines.push(`\nprint checks ${results.length}  fail ${results.filter(r => !r.pass).length}`);
console.log(lines.join('\n'));
writeFileSync(join(OUT, 'print-output.txt'), lines.join('\n'));
writeFileSync(join(OUT, 'print-results.json'), JSON.stringify(results, null, 1));
