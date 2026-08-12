/* Meta-test: the in-page syntax reference stays true to the parser.
   The 110e88a restack found `verdict:` missing from all seven tools that accept
   it, `story:` missing from roadmap, and stale glosses — because nothing checked
   the page against the parser. This closes it, the mobile.mjs way: a hand-kept
   per-tool map (config keys + a sample doc using every one), with three
   assertions per tool —
   (1) the sample doc parses through the REAL parse.js with ZERO warnings, so a
       key the parser dropped (or never had) fails here, keeping the map honest;
   (2) every key appears as a <code>key…</code> token inside the page's
       <details class="syntax"> block, so the reference can't silently omit one;
   (3) coverage — every index.html carrying a syntax block has a map entry, so a
       new DSL tool can't ship outside this gate. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

const TOOLS = {
  paths: {
    keys: ['title', 'date', 'today', 'style', 'verdict', 'palette', 'accent'],
    doc: ['title: T', 'date: off', 'today: 2026-12-22', 'style: tree', 'verdict: off',
      'palette: ocean', 'accent: #C05621',
      'decision groups:', '  question: Do friends appear?', '  signal: invites >= 3',
      '  owner: growth', '  answer-by: 2026-12-15',
      'NOW', '  Core: Shared work', '  Core: Rides it [if groups]'].join('\n'),
  },
  roadmap: {
    keys: ['title', 'date', 'headline', 'story', 'horizons', 'wip', 'fade', 'palette', 'accent', 'style', 'focus', 'verdict', 'group', 'basis'],
    doc: ['title: T', 'date: off', 'headline: A claim', 'story: A change story',
      'horizons: Now, Next, Later', 'wip: 6', 'fade: off', 'palette: ocean',
      'accent: #C05621', 'style: register', 'focus: Next', 'verdict: off', 'group: outcome',
      'basis: paths "Growth decisions"; answered pricing=yes@2026-08-03',
      'NOW', 'Core: A'].join('\n'),
  },
  timeline: {
    keys: ['title', 'palette', 'accent', 'today', 'verdict'],
    doc: ['title: T', 'palette: ocean', 'accent: #C05621', 'today: 2026-08-01',
      'verdict: We hold the date', 'A 2026-09 .. 2026-10'].join('\n'),
  },
  map: {
    keys: ['preset', 'title', 'palette', 'accent', 'x', 'y', 'zones', 'verdict'],
    doc: ['preset: assumptions', 'title: T', 'palette: ocean', 'accent: #C05621',
      'x: Low, High', 'y: Weak, Strong', 'zones: grid 2x2', 'verdict: Test A first',
      'A @ 20,80'].join('\n'),
  },
  case: {
    keys: ['title', 'question', 'status', 'verdict', 'palette', 'accent'],
    doc: ['title: T', 'question: Ship it?', 'status: decided', 'verdict: We ship',
      'palette: ocean', 'accent: #C05621', 'Money: NPV model -> /fermi/#x // why it matters'].join('\n'),
  },
  wardley: {
    keys: ['title', 'palette', 'accent', 'verdict', 'anchor'],
    doc: ['title: T', 'palette: ocean', 'accent: #C05621', 'verdict: Buy it',
      'anchor: User need', 'A @ product', 'User need -> A'].join('\n'),
  },
  tree: {
    keys: ['title', 'currency', 'palette', 'accent', 'verdict'],
    doc: ['title: T', 'currency: £', 'palette: ocean', 'accent: #C05621',
      'verdict: We bid', 'Bid decision', '  Submit (p=0.5) : 100', '  Walk (p=rest) : 0'].join('\n'),
  },
  why: {
    keys: ['title', 'palette', 'accent'],
    doc: ['title: T', 'palette: ocean', 'accent: #C05621',
      'outcome: Retention holds', '  Streaks drive habit', '    Streak engine [testing]'].join('\n'),
  },
  gauge: {
    keys: ['title', 'names', 'palette', 'accent', 'verdict'],
    doc: ['title: T', 'names: off', 'palette: ocean', 'accent: #C05621',
      'verdict: The room is split', 'Ship by Q3 :: prob',
      'Pick :: chips A | B'].join('\n'),
  },
  bets: {
    keys: ['title', 'unit'],
    doc: ['title: T', 'unit: £k', 'Book', '  A: stake 40, odds 30-45%, payoff 200-400'].join('\n'),
  },
  'energy/cycles': {
    keys: ['title', 'palette', 'accent', 'verdict', 'battery', 'spread', 'charge', 'second',
      'drift', 'rte', 'fade', 'calendar', 'cycles', 'augment', 'discount'],
    doc: ['title: T', 'palette: ember', 'accent: #B04E1E', 'verdict: The warranty binds',
      'battery: 100MW / 200MWh', 'spread: 35..85', 'charge: 15..45', 'second: 35..60%',
      'drift: -4..0 %/yr', 'rte: 86..90%', 'fade: 0.006..0.012 %/cycle',
      'calendar: 1.0..1.8 %/yr', 'cycles: 6000 over 15yr', 'augment: 120..180 £/kWh',
      'discount: 7..10%'].join('\n'),
  },
  'energy/risk': {
    keys: ['title', 'palette', 'accent', 'unit', 'verdict'],
    doc: ['title: T', 'palette: ember', 'accent: #B04E1E', 'unit: £k/MW/yr',
      'verdict: Take the floor', 'merchant: 60..180', 'floor: 70 share 60% fee 5'].join('\n'),
  },
};

function syntaxBlock(html, tool){
  const at = html.indexOf('<details class="syntax">');
  assert.ok(at >= 0, tool + ': no <details class="syntax"> block');
  const end = html.indexOf('</details>', at);
  return html.slice(at, end);
}

test('every documented tool: sample doc with every config key parses warning-free', async () => {
  for(const [tool, {doc}] of Object.entries(TOOLS)){
    const {parse} = await import(join(ROOT, tool, 'parse.js'));
    const m = parse(doc);
    assert.deepEqual(m.warnings, [], tool + ': the key-exercising doc warned');
  }
});

test('every accepted config key appears in the page syntax reference', () => {
  for(const [tool, {keys}] of Object.entries(TOOLS)){
    const block = syntaxBlock(read(join(tool, 'index.html')), tool);
    for(const k of keys){
      const re = new RegExp('<code[^>]*>[^<]*\\b' + k + '\\s*:');
      assert.ok(re.test(block), tool + ': `' + k + ':` missing from the syntax reference');
    }
  }
});

test('coverage: every page with a syntax block has a map entry here', () => {
  const dirs = [];
  for(const top of readdirSync(ROOT)){
    if(existsSync(join(ROOT, top, 'index.html')) && existsSync(join(ROOT, top, 'parse.js'))) dirs.push(top);
  }
  if(existsSync(join(ROOT, 'energy'))){
    for(const sub of readdirSync(join(ROOT, 'energy'))){
      const rel = join('energy', sub);
      if(existsSync(join(ROOT, rel, 'index.html')) && existsSync(join(ROOT, rel, 'parse.js'))) dirs.push(rel);
    }
  }
  for(const d of dirs){
    if(!read(join(d, 'index.html')).includes('<details class="syntax">')) continue;
    assert.ok(TOOLS[d], d + ' has a syntax reference but no entry in this meta-test — add its keys');
  }
});

test('every syntax block offers try-it specimens (data-try present)', () => {
  for(const tool of Object.keys(TOOLS)){
    const html = read(join(tool, 'index.html'));
    if(!html.includes('<details class="syntax">')) continue;
    const block = syntaxBlock(html, tool);
    const n = (block.match(/<code data-try=""/g) || []).length;
    assert.ok(n >= 3, tool + ': expected try-able specimens, found ' + n);
  }
});
