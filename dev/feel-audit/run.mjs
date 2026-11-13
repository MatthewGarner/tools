/* Feel audit: Roadmap and Timeline. Drives every audited interaction with real input,
   prints measured numbers per interaction and a PASS/FAIL per check against the
   stated expectation in checks.mjs. Checks for defects the audit confirmed are tagged
   [known]; a fix should turn its known FAIL into a PASS.

   One browser at a time, sequential scenarios, a private server on an OS-assigned port.

   node dev/feel-audit/run.mjs [--tool roadmap|timeline] [--only id,id] [--mode normal|cpu4x|both]
                               [--engine chromium|webkit] [--out dir]
   Modes: normal = no throttling; cpu4x = Chromium CDP CPU throttling at 4x (phone stand-in). */
import {mkdirSync, writeFileSync} from 'node:fs';
import {chromium, webkit, startServer} from './lib.mjs';
import {registry, KNOWN} from './checks.mjs';
import * as S from './scenarios.mjs';
import * as D from './disclosures.mjs';
import {controls} from './controls.mjs';
import {FR_PLAN, FR_WEBKIT, FR_KNOWN} from './plan-fermi-rank.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };
const tools = (opt('tool', 'roadmap,timeline')).split(',');
const only = opt('only', '') ? new Set(opt('only').split(',')) : null;
const engine = opt('engine', 'chromium');
const modes = engine === 'webkit' ? ['normal'] : ({both: ['normal', 'cpu4x'], normal: ['normal'], cpu4x: ['cpu4x']})[opt('mode', 'both')];
const out = opt('out', process.env.FEEL_OUT || '/tmp/feel-audit');
mkdirSync(out + '/shots', {recursive: true});

/* [id, tools, modes, fn(env, tool)] — timing scenarios run in both modes; behaviour-only scenarios once */
const T = ['normal', 'cpu4x'], N = ['normal'];
const PLAN = [
  ['load', ['roadmap', 'timeline'], T, async (e, t) => { for(const k of ['desktop', 'phone']) await S.load(e, t, k); await S.load(e, t, 'desktop', {source: S.stress(t, 'dense'), label: 'dense'}); }],
  ['views', ['roadmap', 'timeline'], T, async (e, t) => { for(const k of ['desktop', 'phone']) await S.views(e, t, k); await S.views(e, t, 'desktop', {source: S.stress(t, 'dense'), label: 'dense'}); }],
  ['rail', ['roadmap', 'timeline'], T, async (e, t) => { await S.rail(e, t, 'desktop'); if(e.mode === 'normal') await S.rail(e, t, 'phone'); }],
  ['type', ['roadmap', 'timeline'], T, async (e, t) => { await S.keyRender(e, t, 'desktop'); await S.keyRender(e, t, 'desktop', {source: S.stress(t, 'dense'), label: 'dense'}); }],
  ['menu', ['roadmap', 'timeline'], T, async (e, t) => { for(const k of ['desktop', 'phone']) await S.menus(e, t, k); }],
  ['eip', ['roadmap', 'timeline'], T, async (e, t) => { for(const k of ['desktop', 'phone']) await S.rename(e, t, k); }],
  ['invalid', ['roadmap', 'timeline'], N, async (e, t) => { await S.validation(e, t, 'desktop'); }],
  ['menucommit', ['roadmap', 'timeline'], T, async (e, t) => { for(const k of ['desktop', 'phone']) await S.menuCommit(e, t, k); }],
  ['add', ['roadmap', 'timeline'], N, async (e, t) => { for(const k of ['desktop', 'phone']) await S.addRemove(e, t, k); }],
  ['drag', ['roadmap'], T, async e => S.drag(e)],
  ['whatif', ['roadmap'], T, async e => S.whatif(e)],
  ['inspect', ['timeline'], T, async e => { for(const k of ['desktop', 'phone']) await S.inspector(e, k); }],
  ['review', ['roadmap'], N, async e => { for(const k of ['desktop', 'phone']) await S.review(e, k); }],
  ['reviewempty', ['timeline'], N, async e => { for(const k of ['desktop', 'phone']) await S.reviewEmpty(e, k); }],
  ['shell', ['roadmap', 'timeline'], T, async (e, t) => { await S.shell(e, t, 'desktop'); if(e.mode === 'normal') await S.shell(e, t, 'phone'); }],
  ['theme', ['roadmap', 'timeline'], T, async (e, t) => { await S.theme(e, t, 'desktop'); if(e.mode === 'normal'){ await S.theme(e, t, 'phone'); await S.theme(e, t, 'desktop', true); } }],
  ['reduced', ['roadmap', 'timeline'], N, async (e, t) => S.reduced(e, t)],
  ['keyboard', ['roadmap', 'timeline'], N, async (e, t) => S.keyboard(e, t)],
  ['hover', ['roadmap', 'timeline'], N, async (e, t) => S.hover(e, t)],
  ['touch', ['roadmap', 'timeline'], N, async (e, t) => S.touch(e, t)],
  ['scroll', ['roadmap', 'timeline'], T, async (e, t) => { await S.scroll(e, t, 'desktop', S.stress(t, 'dense')); if(e.mode === 'normal') await S.scroll(e, t, 'phone', S.stress(t, 'dense')); }],
  ['disclosures', ['roadmap', 'timeline'], N, async (e, t) => { for(const k of ['desktop', 'phone']) await D.disclosures(e, t, k); }],
  ['controls', ['roadmap', 'timeline'], N, async (e, t) => { for(const k of ['desktop', 'phone']) await controls(e, t, k); }],
  ['zoom', ['roadmap', 'timeline'], N, async (e, t) => { for(const k of ['desktop', 'phone']) await S.zoom(e, t, k); }],
  ...FR_PLAN,
];
/* WebKit has no CDP throttling, touch CDP or clipboard permission: the core interactions only */
const WEBKIT_PLAN = new Set(['load', 'views', 'rail', 'type', 'menu', 'eip', 'theme', ...FR_WEBKIT]);
FR_KNOWN.forEach(k => KNOWN.add(k));

const R = registry();
const server = await startServer();
const browser = await (engine === 'webkit' ? webkit : chromium).launch();
const started = Date.now();
let crashed = 0;
try{
  for(const mode of modes) for(const [id, ts, ms, fn] of PLAN){
    if(only && !only.has(id)) continue;
    if(!ms.includes(mode)) continue;
    if(engine === 'webkit' && !WEBKIT_PLAN.has(id)) continue;
    for(const tool of ts){
      if(!tools.includes(tool)) continue;
      const env = {browser, base: server.base, mode, throttle: mode === 'cpu4x' ? 4 : 1, engine, R, out};
      console.log(`\n### ${id} — ${tool} — ${mode}${engine === 'webkit' ? ' (webkit)' : ''}`);
      try{ await fn(env, tool); }
      catch(error){ crashed++; R.check(id + '.ran', `${tool}/-/${mode}`, 'scenario completed', String(error.message).split('\n')[0].slice(0, 220), false, 'no harness error'); }
    }
  }
}finally{
  await browser.close();
  server.stop();
}
const checks = R.rows.filter(r => !r.note);
const fails = checks.filter(r => !r.pass);
console.log(`\n${checks.length} checks: ${checks.length - fails.length} pass, ${fails.length} fail (${fails.filter(f => f.known).length} known), ${crashed} scenario errors, ${Math.round((Date.now() - started) / 1000)}s, engine ${engine}`);
writeFileSync(`${out}/results-${engine}${only ? '-' + [...only].join('_') : ''}.json`, JSON.stringify(R.rows, null, 1));
process.exitCode = fails.some(f => !f.known) ? 1 : 0;
