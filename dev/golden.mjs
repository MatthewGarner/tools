/* Golden-output harness: renders fixed models through render.js and writes/compares
   exact SVG strings. Usage: node dev/golden.mjs capture|compare */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {parse} from '../roadmap/parse.js';
import {render} from '../roadmap/render.js';

const ctxBase = {
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'}},
  measure: (t) => t.length * 7,
};
const docs = {
  lanes: 'title: T\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- note here\nGrowth: Referral flow [risk]\nNEXT\nCore: Smart reminders\nLATER\nGrowth: Coach marketplace [done]',
  nolanes: 'date: 2026-07-04\nNOW\nplain item\nNEXT\nanother much longer item title that wraps across lines for sure definitely',
  quarterly: 'title: Q\ndate: 2026-07-04\nhorizons: quarterly from Q3 2026 x5\nwip: off\nfade: off\nQ3 2026\nA: one\nQ1 2027\nB: two',
};
const variants = {};
for(const [k, src] of Object.entries(docs)){
  const m = parse(src);
  variants[k] = render(m, {...ctxBase});
  variants[k + '-slide'] = render(m, {...ctxBase, slide: true});
}
{
  const m = parse(docs.lanes);
  variants['lanes-diff'] = render(m, {...ctxBase, diff: {
    badge: it => it.title === 'Smart reminders' ? {kind:'new', label:'New'} :
                 it.title === 'Referral flow' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old thing one', 'old thing two', 'old thing three'],
    since: '2026-06-01', any: true,
  }});
}

/* tree fixtures (dates normalised so captures are stable) */
{
  const {parse: tparse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render: trender} = await import('../tree/render.js');
  const bid = 'title: T\nRoot\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0';
  const m = tparse(bid);
  const r = evaluate(m);
  variants['tree-bid'] = trender(m, r, {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['tree-bid-slide'] = trender(m, r, {...ctxBase, slide: true}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
}

/* /why fixtures (dates normalised) */
{
  const {parse: wparse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const doc = 'title: T\noutcome: Retention\n  Forgetting habits\n    Smart reminders [testing]\n      ? wanted\n    Streak freeze [delivering]\n      ? works [holds]\n  Chores feeling\n  Orphan [delivering]';
  const m = wparse(doc);
  const pr = project(m);
  const norm = s => s.replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  variants['why-ost'] = norm(renderOst(m, pr, {...ctxBase}));
  variants['why-map'] = norm(renderMap(m, pr, {...ctxBase}));
  variants['why-map-slide'] = norm(renderMap(m, pr, {...ctxBase, slide: true}));
}

const mode = process.argv[2];
mkdirSync(new URL('./golden/', import.meta.url), {recursive: true});
let fails = 0;
for(const [k, svg] of Object.entries(variants)){
  const file = new URL('./golden/' + k + '.svg', import.meta.url);
  if(mode === 'capture'){
    writeFileSync(file, svg);
    console.log('captured ' + k + ' (' + svg.length + ' chars)');
  } else {
    const want = readFileSync(file, 'utf8');
    if(want === svg) console.log('IDENTICAL ' + k);
    else { console.log('DIFFERS ' + k + ' (' + want.length + ' -> ' + svg.length + ')'); fails++; }
  }
}
process.exit(fails ? 1 : 0);
