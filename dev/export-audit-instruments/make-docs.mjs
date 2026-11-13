/* Writes the stress documents into docs/<tool>/. Re-run to regenerate; the built-in examples are read
   from the product source so they stay verbatim. */
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {HERE, ROOT} from './lib.mjs';

const w = (p, s) => { const f = join(HERE, 'docs', p); mkdirSync(join(f, '..'), {recursive: true}); writeFileSync(f, typeof s === 'string' ? s : JSON.stringify(s, null, 1)); };
const AWK = 'R&D <alpha> "beta" | ‘quotes’ 🚀 עברית café Zoë';
const UNBROKEN = 'Supercalifragilisticexpialidocious_unbroken_identifier_with_no_spaces_anywhere_at_all';
const URL_LONG = 'https://example.com/a/very/long/url/that/does/not/break/anywhere/at/all/because/it/is/one/token';

/* ---------------------------------------------------------------- bets */
const betsApp = readFileSync(join(ROOT, 'bets/app.js'), 'utf8');
const betsEx = [...betsApp.matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)];
betsEx.forEach((m, i) => w(`bets/a${i}-example.txt`, `// built-in example: ${m[1]} (verbatim)\n${m[2]}`));
w('bets/c-starter.txt', '// the Start your own skeleton (verbatim)\n' + readFileSync(join(ROOT, 'bets/starter.js'), 'utf8').match(/STARTER = `([\s\S]*?)`/)[1]);
w('bets/d-single.txt', `// one bet, no title, no unit
Bets
  Only bet: stake 10, odds 50%, payoff 25`);
w('bets/e-awkward-text.txt', `// characters that break things: & < > quotes pipes emoji RTL combining marks NBSP long unbroken word
title: ${AWK}
unit: €k

Group A & B | <tags>
  Fish & chips <b>bold</b> | pipe: stake 10, odds 20-30%, payoff 40-80
    kill: “Smart” quotes & ampersands <script> | pipes by 2026-12-01
  שלום עולם RTL bet: stake 12, odds 30-40%, payoff 50-90
    kill: מבחן בעברית with mixed text
  Emoji 🚀🔥👩🏽‍💻 bet: stake 8, odds 10-20%, payoff 30-200
  Zalgo z̷̢a̶l̸g̵o combining é é: stake 5, odds 50-60%, payoff 9-12
  Non breaking spaces here: stake 7, odds 40-50%, payoff 15-20
  ${UNBROKEN}: stake 20, odds 35-45%, payoff 50-70
    kill: ${URL_LONG}`);
const longName = 'Rebuild the onboarding journey for small teams who arrive from the marketing site and need to invite colleagues before their trial ends';
const longKill = 'We stop if fewer than one in five teams invites a colleague in their first week, measured over two consecutive monthly cohorts, and the support queue shows no sign of the confusion we expected to fix';
w('bets/f-long-text.txt', `// very long names, group names, kill criteria and title
title: A deliberately long portfolio title that keeps going well past the width a slide title would normally allow on one line
unit: £k

A very long group heading that describes the strategic theme in far more words than anyone should
  ${longName}: stake 120, odds 30-50%, payoff 200-600
    kill: ${longKill} by 2026-12-31
  ${longName} (second variant): stake 80, odds 20-40%, payoff 100-500
    kill: ${longKill}
Short
  Tiny: stake 1, odds 50%, payoff 2`);
let many = '// many bets: 8 groups x 8 = 64 bets (well beyond a typical portfolio)\ntitle: Large portfolio\nunit: £k\n\n';
for(let g = 1; g <= 8; g++){
  many += `Theme ${g}\n`;
  for(let b = 1; b <= 8; b++){
    many += `  Bet ${g}.${b} on workstream ${String.fromCharCode(64 + b)}: stake ${10 * b + g}, odds ${5 * b}-${5 * b + 20}%, payoff ${20 * b + g * 5}-${40 * b + g * 10}\n`;
    if(b % 2) many += `    kill: Signal ${g}.${b} below target by 2026-12-${String(10 + b).padStart(2, '0')}\n`;
  }
}
w('bets/g-many.txt', many);
let mid = '// a realistic larger portfolio: 3 groups, 12 bets\ntitle: Twelve bets\nunit: £k\n\n';
for(let g = 1; g <= 3; g++){ mid += `Group ${g}\n`; for(let b = 1; b <= 4; b++) mid += `  Initiative ${g}.${b}: stake ${30 * b}, odds ${10 * b}-${10 * b + 15}%, payoff ${80 * b}-${150 * b}\n    kill: Metric ${g}.${b} flat by 2026-12-01\n`; }
w('bets/g2-twelve.txt', mid);
w('bets/h-extreme-numbers.txt', `// huge, tiny, zero, certain and impossible odds, non-finite and negative inputs
title: Extreme numbers
unit: £

Big
  Moonshot: stake 1000000000000, odds 0.1-1%, payoff 999999999999999
  Sure thing: stake 1, odds 100%, payoff 1.5
  Impossible: stake 50, odds 0%, payoff 100
  Zero stake: stake 0, odds 50%, payoff 10
  Zero payoff: stake 10, odds 50%, payoff 0
Small
  Fraction: stake 0.1, odds 49.5-50.5%, payoff 0.2-0.3
  Negative stake: stake -40, odds 50%, payoff 100
  Not a number: stake abc, odds 50%, payoff 100
  Infinity: stake 1e999, odds 50%, payoff 10
  Odds as fraction: stake 10, odds 0.5, payoff 30`);
w('bets/i-warnings.txt', `// warnings: unknown key, config after content, bet before group, bad indent, missing attributes
title: Warnings
colour: red
Orphan bet: stake 10, odds 50%, payoff 30
Lane
  Fine: stake 10, odds 40-60%, payoff 30-50
  Missing attrs
   Bad indent: stake 5, odds 50%, payoff 10
  Wrong attr: stake 5, chance 50%, payoff 10
    note: not a kill line
unit: £k`);
w('bets/j-no-bets.txt', '// empty model: a title and a group but no bets\ntitle: Nothing yet\nBets');

/* ---------------------------------------------------------------- tree */
const treeApp = readFileSync(join(ROOT, 'tree/app.js'), 'utf8');
[...treeApp.matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].forEach((m, i) => w(`tree/a${i}-example.txt`, `// built-in example: ${m[1]} (verbatim)\n${m[2]}`));
w('tree/c-starter.txt', '// the Start your own skeleton (verbatim)\n' + readFileSync(join(ROOT, 'tree/starter.js'), 'utf8').match(/STARTER = `([\s\S]*?)`/)[1]);
w('tree/d-single.txt', '// a root with one leaf option\nOnly choice\n  Do it : 100');
w('tree/e-awkward-text.txt', `// characters that break things
title: ${AWK}
currency: €
Choose & decide <now>
  Fish & chips <b>bold</b> | pipe
    Works “well” (p=0.4) : 100k
    שלום עולם RTL (p=rest) : -20k
  Emoji 🚀🔥👩🏽‍💻 path : 10k to 30k
  Zalgo z̷̢a̶l̸g̵o é é : 5k
  Non breaking spaces : 2k
  ${UNBROKEN} : 1k`);
w('tree/f-long-text.txt', `// very long labels and title, authored verdict
title: A deliberately long decision title that keeps going well past the width a slide title would normally allow on one line
verdict: We should take the slower but safer route because the downside of the faster route is a cost we cannot carry this year, at roughly 120k
currency: £
Which route do we take for the platform migration given the constraints we have this year
  Migrate everything in one big weekend cutover with the whole team on call and a rollback plan
    The cutover goes cleanly and nobody notices anything other than faster pages (p=0.55) : 400k to 700k
    The cutover fails part way and we spend a fortnight rolling back while customers complain loudly (p=rest) : -600k to -200k
  Migrate service by service over two quarters with dual running costs for the whole period : 120k to 300k`);
let tm = '// many branches: 8 options x 5 outcomes, a further level under each fifth outcome\ntitle: Wide tree\ncurrency: $\nPick a market\n';
for(let o = 1; o <= 8; o++){
  tm += `  Option ${o}: -${o * 10}k\n    Demand ${o}\n`;
  for(let k = 1; k <= 4; k++) tm += `      Case ${o}.${k} (p=0.2) : ${k * o * 20}k to ${k * o * 40}k\n`;
  tm += `      Case ${o}.5 (p=rest)\n        Retry ${o}\n          Second go (p=0.5) : ${o * 15}k\n          Give up (p=rest) : -${o * 5}k\n`;
}
w('tree/g-many.txt', tm);
w('tree/h-extreme-numbers.txt', `// huge, tiny, zero, negative and absurdly wide ranges
title: Extreme numbers
currency: $
Pick
  Huge : 999b
  Tiny : 0.01
  Zero : 0
  Negative huge : -500b to -1b
  Wide range : 1 to 10m
  Gamble
    Win (p=0.0001) : 1000b
    Lose (p=rest) : -1`);
w('tree/i-verdict-off.txt', '// verdict off: the export must carry none\ntitle: No verdict here\nverdict: off\ncurrency: £\nDecide\n  A : 10k\n  B : 20k');
w('tree/j-warnings.txt', `// warnings: bad currency, odd indent, valueless leaf, p over 1
title: Warnings
currency: ¥
Root
  Leaf without value
   Odd indent : 5
  Chance
    Over one (p=1.4) : 10
    Missing p : 5
    Rest (p=rest) : 1`);

/* ---------------------------------------------------------------- paths */
const LANTERN = readFileSync(join(ROOT, 'paths/app.js'), 'utf8').match(/const LANTERN = `([\s\S]*?)`;/)[1];
w('paths/a-example.txt', '// built-in example: Lantern (verbatim)\n' + LANTERN);
w('paths/b-starter.txt', '// the Start your own skeleton (verbatim)\n' + readFileSync(join(ROOT, 'paths/starter.js'), 'utf8').match(/STARTER = `([\s\S]*?)`/)[1]);
w('paths/c-reference.txt', '// the DSL reference example (answered, assumed, close-out, when:, verdict, palette)\n' + readFileSync(join(ROOT, 'DSL.md'), 'utf8').match(/```dsl tool=paths\n([\s\S]*?)```/)[1]);
w('paths/d-items-only.txt', '// a plan with items and no decisions\ntitle: Items only\nNOW\n  Core: One thing [doing]\nNEXT\n  Core: Another thing');
w('paths/e-awkward-text.txt', `// characters that break things
title: ${AWK}
today: 2026-11-12

decision amp:
  question: Will “R&D” <teams> | partners say yes? 🚀
  signal: שלום עולם replies & sign-ups
  owner: Zoë & Ünal
  answer-by: 2026-12-01
  learn: Ask 10 partners <directly> | by email
  enough: Yes at 7 & above; no at 3

NOW
  Core & Infra: Fish & chips <b>bold</b> | pipe [doing] [if amp]
  Emoji 🚀: Zalgo z̷̢a̶l̸g̵o é é [unless amp]
  RTL: שלום עולם item
  Long: ${UNBROKEN} -- ${URL_LONG}`);
w('paths/f-long-text.txt', `// very long questions, signals, item titles and notes
title: A deliberately long plan title that keeps going well past the width a slide title would normally allow on one line
today: 2026-11-12

decision migrate:
  question: Will enterprise customers with more than five hundred seats accept a mandatory migration to the new permissions model before their renewal date next year
  signal: The share of renewal conversations in which the customer agrees to the migration date without escalating to their account executive or legal team
  reading: Four of the first eleven renewal conversations agreed without escalation, two escalated, and five are still open with no clear direction yet
  learn: Put the migration offer to the next twenty renewals using the same script and the same incentive, and record every escalation
  enough: Yes at fourteen of twenty or more; no at six or fewer; otherwise keep the question open and widen the sample
  owner: Enterprise renewals and the permissions platform team together
  answer-by: 2026-12-20

NOW
  Platform engineering and permissions: Build the migration tooling that moves every role and group to the new permissions model without downtime [doing] [if migrate] -- this is the long pole and nothing else can start until the dry run passes on the three largest tenants
  Customer success: Prepare the fallback in which the old permissions model is kept running for another year for anyone who declines [unless migrate] -- expensive, but cheaper than losing renewals
NEXT
  Platform engineering and permissions: Retire the old permissions model entirely once the last tenant has moved and the audit trail is verified [if migrate]`);
let pm = '// many decisions and items: 10 decisions, 48 items over 4 periods\ntitle: Large plan\ntoday: 2026-11-12\n\n';
for(let d = 1; d <= 10; d++) pm += `decision d${d}:\n  question: Question number ${d} about market ${d}?\n  signal: signal ${d}\n  owner: Team ${d % 4 + 1}\n  answer-by: 2026-${String(d % 12 + 1).padStart(2, '0')}-15\n  learn: Run test ${d}\n  enough: Yes at ${d} or more\n` + (d % 3 === 0 ? `  answer: yes 2026-0${d % 9 + 1}-10\n` : '') + (d % 4 === 1 ? '  assume: no 2026-11-01\n' : '') + '\n';
['NOW', 'NEXT', 'LATER', 'SOMEDAY'].forEach((per, p) => {
  pm += per + '\n';
  for(let i = 1; i <= 12; i++){ const d = (i + p * 3) % 10 + 1; pm += `  Lane ${i % 5 + 1}: Item ${p + 1}.${i} for workstream ${i}` + (i % 3 === 0 ? ` [if d${d}]` : i % 3 === 1 ? ` [unless d${d}]` : '') + (i % 4 === 0 ? ' [risk]' : '') + '\n'; }
});
w('paths/g-many.txt', pm);
w('paths/h-verdict-off.txt', `// verdict off
title: Verdict off
verdict: off
today: 2026-11-12

decision x:
  question: Is X true?
  signal: x
  owner: me
  answer-by: 2026-12-01

NOW
  Core: Do X [if x]
  Core: Do Y [unless x]`);
w('paths/i-warnings.txt', `// warnings: unknown decision, bad status, bad date, mixed and/or
title: Warnings
today: 2026-11-12

decision a:
  question: A?
  answer-by: 2026-13-45

NOW
  Core: Uses unknown [if nosuch]
  Core: Bad status [wibble]
  Core: Mixed [if a and b or c]`);
w('paths/j-decisions-only.txt', `// decisions and no items
title: Decisions only
today: 2026-11-12

decision a:
  question: Is A true?
  signal: a
  owner: team
  answer-by: 2026-12-01
  learn: test a
  enough: yes at 5`);

/* ---------------------------------------------------------------- fermi (page state) */
const fermiApp = readFileSync(join(ROOT, 'fermi/app.js'), 'utf8');
const exBlock = fermiApp.match(/const EXAMPLES = \[([\s\S]*?)\n\];/)[1];
const fermiEx = eval('[' + exBlock + ']');
fermiEx.forEach((ex, i) => w(`fermi/a${i}-example.json`, {about: 'built-in example: ' + ex.name, state: {f: ex.f, q: ex.q, u: ex.u, v: Object.fromEntries(Object.entries(ex.v).map(([k, [lo, hi]]) => [k, [lo, hi, 'auto']]))}}));
w('fermi/b-single.json', {about: 'one input', state: {f: 'x', v: {x: ['10', '20', 'auto']}}});
w('fermi/c-point.json', {about: 'a point estimate (lo = hi): zero spread', state: {f: 'a * b', v: {a: ['5', '5', 'auto'], b: ['3', '3', 'auto']}}});
w('fermi/d-awkward-text.json', {about: 'question and unit with & < > quotes pipes emoji RTL combining marks; long unbroken word in question', state: {f: 'fish_and_chips * zoe_count', q: 'R&D <alpha> "beta" | ‘quotes’ 🚀 עברית z̷̢a̶l̸g̵o café Zoë — ' + UNBROKEN, u: '€ & <units> | 🚀', v: {fish_and_chips: ['10', '20', 'auto'], zoe_count: ['3', '9', 'auto']}}});
w('fermi/e-long-text.json', {about: 'question at the 180-character limit, unit at 48, long variable names and formula', state: {
  f: 'number_of_enterprise_customers_in_the_region * share_that_would_adopt_the_new_permissions_model * average_seats_per_customer_after_migration * price_per_seat_per_year_in_pounds',
  q: 'How much additional annual recurring revenue could the permissions migration unlock across the enterprise segment if adoption follows the pattern we saw in the pilot cohorts?',
  u: 'pounds of annual recurring revenue per year (£)',
  v: {number_of_enterprise_customers_in_the_region: ['300', '600', 'auto'], share_that_would_adopt_the_new_permissions_model: ['0.1', '0.4', 'auto'], average_seats_per_customer_after_migration: ['200', '900', 'auto'], price_per_seat_per_year_in_pounds: ['40', '90', 'auto']}}});
const manyV = {}; let f = [];
for(let i = 1; i <= 14; i++){ manyV['input_' + i] = [String(i), String(i * 3), 'auto']; f.push('input_' + i); }
w('fermi/f-many.json', {about: '14 inputs (a long formula and assumptions list)', state: {f: f.join(' * ') + ' / scale', q: 'Fourteen inputs', v: {...manyV, scale: ['1T', '2T', 'auto']}}});
w('fermi/g-extreme.json', {about: 'huge, tiny and negative ranges, mixed signs (normal fit), threshold set', state: {f: 'huge * tiny + neg', q: 'Extremes', u: 'units', t: '1e9', v: {huge: ['1e12', '1e15', 'auto'], tiny: ['0.000001', '0.001', 'auto'], neg: ['-5e9', '2e9', 'auto']}}});
w('fermi/h-uniform-threshold.json', {about: 'a uniform input and a threshold (P(> t) line in exports)', state: {f: 'a + b', q: 'Uniform and threshold', u: 'days', t: '30', v: {a: ['10', '20', 'uni'], b: ['5', '25', 'auto']}}});
w('fermi/i-invalid.json', {about: 'non-finite and unreadable input: the page should say so and offer no export', state: {f: 'a / b', v: {a: ['abc', '10', 'auto'], b: ['0', '0', 'auto']}}});
w('fermi/j-compare.json', {about: 'compare variants A and B', state: {a: {f: 'a * b', q: 'Variant comparison', u: 'k', v: {a: ['10', '20', 'auto'], b: ['2', '5', 'auto']}}, b: {f: 'a * b * c', q: 'Variant comparison', u: 'k', v: {a: ['10', '20', 'auto'], b: ['2', '5', 'auto'], c: ['0.8', '1.5', 'auto']}}, on: 'A'}});
w('fermi/k-cf-default.json', {about: 'cashflow: the default New feature investment', state: {m: 'cf', g: 'year', h: 5, rl: '8', rh: '12', p: [['-250k', '-180k'], ['-40k', '20k'], ['30k', '90k'], ['60k', '140k']]}});
w('fermi/l-cf-runway.json', {about: 'cashflow: Runway example (months)', state: {m: 'cf', g: 'month', h: 24, rl: '0', rh: '0', p: [['400k', '400k'], ['-45k', '-25k']]}});
w('fermi/m-cf-geared.json', {about: 'cashflow: geared build with debt sizing (levered IRR)', state: {m: 'cf', g: 'year', h: 15, rl: '9', rh: '11', p: [['-7.2M', '-6.8M'], ...Array(15).fill(['880k', '1.35M'])], d1: 1, dscr: '1.45', rd: '6.5', ten: '9', dcase: 'central'}});
w('fermi/n-cf-sixty.json', {about: 'cashflow: 60 monthly periods (the maximum horizon), all entered, threshold set', state: {m: 'cf', g: 'month', h: 60, rl: '5', rh: '15', ct: '0', p: [['-2M', '-1.5M'], ...Array.from({length: 60}, (_, i) => [String(-50 + i * 3) + 'k', String(-20 + i * 4) + 'k'])]}});
w('fermi/o-cf-extreme.json', {about: 'cashflow: huge and negative-only flows (NPV never positive; no IRR)', state: {m: 'cf', g: 'year', h: 6, rl: '3', rh: '40', p: [['-9e12', '-1e12'], ['-5', '-1'], ['-1e9', '1e9']]}});

/* ---------------------------------------------------------------- rank (page state) */
const rankEx = (await import(join(ROOT, 'rank/examples.js'))).EXAMPLES;
const C = [['Value', 3], ['Time criticality', 2], ['Risk reduction', 1]];
rankEx.forEach((ex, i) => w(`rank/a${i}-example.json`, {about: 'built-in example: ' + ex.name, state: {c: C, e: ['Effort', 1], i: ex.items, k: ex.k, w: 50, s: 1}}));
w('rank/b-single.json', {about: 'one initiative', state: {c: C, e: ['Effort', 1], i: [['Only one', 5, 5, 5, 5]], k: 1, w: 50, s: 1}});
w('rank/c-awkward-text.json', {about: 'names with pipes, & < > quotes emoji RTL combining marks, backslashes and a long unbroken word; criterion names with pipes', state: {c: [['Value | impact', 3], ['Time <criticality>', 2], ['Risk & "reduction"', 1]], e: ['Effort | cost', 1], i: [
  ['Fish & chips | pipe', 8, 8, 6, 4], ['<b>bold</b> & <script>', 7, 6, 5, 4], ['Emoji 🚀🔥👩🏽‍💻', 9, 3, 5, 5], ['שלום עולם RTL', 5, 9, 4, 5], ['Zalgo z̷̢a̶l̸g̵o é é', 4, 3, 6, 7], ['Back\\slash \\| escaped', 6, 6, 6, 6], ['Star *bold* _under_ `code` [link](x)', 5, 5, 5, 5], [UNBROKEN, 3, 3, 3, 3]], k: 3, w: 50, s: 1}});
w('rank/d-long-text.json', {about: 'very long initiative names', state: {c: C, e: ['Effort', 1], i: [[longName, 8, 8, 6, 4], [longName + ' (variant)', 7, 6, 5, 4], ['Short', 9, 3, 5, 5]], k: 2, w: 50, s: 1}});
const many50 = Array.from({length: 50}, (_, i) => ['Initiative ' + (i + 1), (i * 7) % 10 + 1, (i * 3) % 10 + 1, (i * 5) % 10 + 1, (i * 11) % 10 + 1]);
w('rank/e-many.json', {about: '50 initiatives, top 10', state: {c: C, e: ['Effort', 1], i: many50, k: 10, w: 50, s: 1}});
w('rank/f-ties.json', {about: 'every initiative scored the same (a five-way tie)', state: {c: C, e: ['Effort', 1], i: Array.from({length: 5}, (_, i) => ['Tie ' + (i + 1), 5, 5, 5, 5]), k: 2, w: 50, s: 1}});
w('rank/g-extreme-wobble.json', {about: 'wobble at its extremes (weights 200%, scores 5) and zero weights', state: {c: [['Value', 0], ['Time criticality', 0], ['Risk reduction', 10]], e: ['Effort', 1], i: rankEx[0].items, k: 3, w: 200, s: 5}});
w('rank/h-no-wobble.json', {about: 'no wobble at all (weights 0, scores 0)', state: {c: C, e: ['Effort', 1], i: rankEx[0].items, k: 3, w: 0, s: 0}});
w('rank/i-orders.json', {about: 'the Do two orders agree? panel filled (A vs B)', state: {c: C, e: ['Effort', 1], i: rankEx[0].items, k: 3, w: 50, s: 1, o: ['Resume position\nReading reminders\nHome widget\nClub challenges\nOnboarding redesign', 'Home widget\nResume position\nClub challenges\nReading reminders\nOnboarding redesign']}});
console.log('docs written');
