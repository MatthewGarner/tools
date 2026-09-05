import {layoutObservatory,observatoryPages,observatoryColors} from '../observatory.js';
const words = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]).join(' ');
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {render, timelineReadout, timelineVerdict, toMarkdown} from '../render.js';
import {mergeBias} from '../mergebias.js';

const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
    brand: '#E2231A', brandText: '#D62015'},
  measure: t => t.length * 7,
  today: parseDate('2026-07-06'),
};
const DOC = `title: Storage site — programme
Grid: Connection offer 2026-08 .. 2026-10
Grid: Energisation 2027-02-15 .. 2027-06-01 [risk] // DNO dependent
Build: FID 2026-06-30 [done]
Build: Vendor selection 2026-11`;

test('every milestone renders: solid P50 diamond, whisker + open P90 diamond for ranges', () => {
  const svg = render(parse(DOC), ctx);
  assert.equal((svg.match(/data-ms="p50"/g) || []).length, 4);
  assert.equal((svg.match(/data-ms="p90"/g) || []).length, 2);   // done + single have no whisker
  assert.match(svg, /data-ms="whisker"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('status words and completion colour survive with the uncertainty warning', () => {
 const m=parse(DOC),s=render(m,ctx),C=observatoryColors(m,ctx);assert.match(s,new RegExp('data-ms="p50"[^>]*fill="'+C.status.done+'"'));assert.match(words(s),/RISK/);assert.match(s,/±\?/);
});

test('today line present and labelled; lanes render as bands', () => {
  const svg = render(parse(DOC), ctx);
  assert.match(svg, /data-today/);
  assert.match(svg, />Today ·[^<]+</); // stronger today marker: a filled flag pill
  assert.match(svg, />GRID</);
  assert.match(svg, />BUILD</);
});

/* Swiss 6b: the artefact leads with ONE verdict line carrying ONE key figure,
   with the remaining operational bits as the muted supporting line. */
test('verdict: next milestone up leads, widest whisker supports, P50 date is the figure', () => {
  const v = timelineVerdict(parse(DOC), ctx.today);
  assert.equal(v.line, 'Next up: Connection offer — P50 Aug 2026, could slip to Oct 2026.');
  assert.equal(v.fig, 'Aug 2026');
  assert.ok(v.line.includes(v.fig), 'the figure must appear verbatim in the line');
  assert.match(v.rest, /^Widest whisker: Energisation — 15 weeks between P50 and P90\.$/);
});

test('authored conclusions remain visible while automatic analysis stays separate', () => {
 const s=render(parse(DOC),ctx);assert.doesNotMatch(words(s),/Next up:|Widest whisker:|VERDICT/);const authored=render(parse('verdict: Keep the review clear.\n'+DOC),ctx);assert.match(words(authored),/Keep the review clear/);assert.match(timelineReadout(parse(DOC),ctx.today),/Next up:/);
});

test('readout: a same-month range switches to day grain instead of repeating the month', () => {
  const v = timelineVerdict(parse('X 2026-08-14 .. 2026-08-28'), ctx.today);
  assert.equal(v.line, 'Next up: X — P50 14 Aug 2026, could slip to 28 Aug 2026.');
  assert.equal(v.fig, '14 Aug 2026');
});

test('edit hooks: label, dates, status, add and remove affordances', () => {
  const svg = render(parse(DOC), ctx, null, {edit: true});
  assert.match(svg, /data-edit="label" data-line="1" data-raw="Connection offer"/);
  assert.match(svg, /data-edit="dates" data-line="1" data-raw="2026-08 \.\. 2026-10"/);
  assert.match(svg, /data-edit="status" data-line="1"/);
  assert.match(svg, /data-edit="additem"/);
  assert.match(svg, /data-edit="removeitem" data-line="4"/);
  const plain = render(parse(DOC), ctx);
  assert.doesNotMatch(plain, /data-edit/);
});

test('edit: named lanes and the unlaned footer each carry an explicit return route', () => {
  const svg = render(parse(DOC), ctx, null, {edit: true});
  const zones = [...svg.matchAll(/data-edit="additem"[^>]*data-lane="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(zones.sort(), ['', 'Build', 'Grid']);
  const plain = render(parse(DOC), ctx);
  assert.doesNotMatch(plain, /data-edit="additem"/);
});

test('lane add actions have discrete 44px targets', () => {
 const s=render(parse(DOC),ctx,null,{edit:true});for(const lane of ['Grid','Build'])assert.match(s,new RegExp('data-edit="additem"[^>]*data-lane="'+lane+'"[\s\S]*?<rect[^>]*width="44" height="44"'.replace('[sS]','[\\s\\S]')));
});

test('edit: lane add zone esc\'s a hostile lane name and skips the unnamed lane', () => {
  const doc = 'X 2026-08 .. 2026-09\n"><script>: Y 2026-08 .. 2026-09';
  const svg = render(parse(doc), ctx, null, {edit: true});
  const zones = [...svg.matchAll(/data-edit="additem"[^>]*data-lane="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(zones.sort(), ['', '&quot;&gt;&lt;script&gt;']);
  assert.doesNotMatch(svg, /<script>/);
});

test('long labels retain both inspection and their named-lane add route', () => {
 const m=parse('Grid: '+ 'A'.repeat(300)+' 2026-08 .. 2026-09'),L=layoutObservatory(m,ctx,null,{edit:true}),s=render(m,ctx,null,{edit:true});assert.ok(L.rows[0].h>200);assert.match(s,/data-edit="additem"[^>]*data-lane="Grid"/);assert.match(s,/data-inspect=/);
});

test('lane add actions stay outside editable milestone rows', () => {
 const s=render(parse('Grid: FID 2026-07-10 [done] // pending review'),ctx,null,{edit:true});assert.match(s,/data-edit="dates"/);assert.match(s,/data-edit="additem"[^>]*data-lane="Grid"/);assert.match(s,/data-field-note=/);assert.ok(s.indexOf('data-edit="additem"')<s.indexOf('data-field-item='));
});

test('markdown: table, no-range flag, slip list when comparing', async () => {
  const {toMarkdown} = await import('../render.js');
  const md = toMarkdown(parse(DOC), null, 'https://x.test/t');
  assert.match(md, /\| Vendor selection \| Build \| — \| 15 Nov 2026 \| no range \|/);
  assert.match(md, /x\.test/);
});

test('markdown carries the resolved verdict — authored, computed, or none at all', async () => {
  const {toMarkdown, timelineVerdict} = await import('../render.js');
  const today = Math.floor(Date.parse('2026-08-01') / 86400000);
  const auto = parse(DOC);
  const autoLine = timelineVerdict(auto, today).line;
  assert.ok(autoLine, 'fixture yields a computed verdict');
  assert.ok(toMarkdown(auto, null, 'http://x', today).includes('**' + autoLine + '**'));
  const auth = parse('verdict: We hold the date\n' + DOC);
  assert.ok(toMarkdown(auth, null, 'http://x', today).includes('**We hold the date**'));
  const off = parse('verdict: off\n' + DOC);
  assert.ok(!toMarkdown(off, null, 'http://x', today).includes(autoLine), 'off silences the doc too');
});

test('deterministic given a fixed today; presentation is an explicit intent, never a slide flag', () => {
  const a = render(parse(DOC), ctx);
  assert.equal(a, render(parse(DOC), ctx));
  const slide = render(parse(DOC), {...ctx, slide: true});
  assert.equal(a, slide);
  assert.doesNotMatch(slide, /NaN/);
});

test('empty model renders a placeholder-free minimal svg without crashing', () => {
  const svg = render(parse('title: X'), ctx);
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /NaN/);
});

/* ---------- merge-bias readout ---------- */
const MERGE_DOC = `title: Programme — merge risk
Grid: Energisation 2027-02 .. 2027-06
Build: Commissioning 2027-03 .. 2027-08
Consents: DCO 2027-01 .. 2027-05`;

test('merge readout: ≥2 ranged lanes → verdict leads with Merge risk', () => {
  const m = parse(MERGE_DOC);
  assert.match(timelineReadout(m, ctx.today), /^Merge risk: 3 ranged lanes/);
});


test('aggregate modelling remains available without automatic artifact narration', () => {
 const m=parse(MERGE_DOC),v=timelineVerdict(m,ctx.today);assert.match(v.line,/^Merge risk: all 3 ranged lanes/);assert.ok(v.line.includes(v.fig));assert.match(v.rest,/Next up:/);assert.match(timelineReadout(m,ctx.today),/Merge risk:/);assert.doesNotMatch(words(render(m,ctx)),/Merge risk:|Next up:/);
});

test('aggregate analysis counts ranged lanes rather than every lane', () => {
 const m=parse(MERGE_DOC+'\nOps: Handover 2027-09');assert.match(timelineVerdict(m,ctx.today).line,/Merge risk: all 3 ranged lanes/);
});

test('stale-lane flag: a fitted lane past its P90 is named in the prose form only (a)', () => {
  // today 2026-07-06: A finished 2026-01..2026-03 (P90 past) and is still open; B is ahead
  const doc = 'title: Stale\nA: Finish 2026-01 .. 2026-03\nB: Launch 2026-11 .. 2027-02';
  assert.match(timelineReadout(parse(doc), ctx.today), /1 lane past its P90 — re-estimate it/);
  assert.doesNotMatch(render(parse(doc), ctx), /past its P90/);   // short stays terse (the whisker shows it)
});

test('analysis never claims a bare zero probability', () => {
 const m=parse('title: Nine\n'+Array.from({length:9},(_,i)=>`L${i}: Finish 2027-01 .. 2027-04`).join('\n'));const result=timelineReadout(m,ctx.today);assert.match(result,/together <1%\./);assert.doesNotMatch(result,/≈ <1%|\b0%/);
});

test('non-merge doc: no Merge risk, unchanged single-row readout', () => {
  assert.doesNotMatch(timelineReadout(parse(DOC), ctx.today), /Merge risk/);
  assert.doesNotMatch(render(parse(DOC), ctx), /Merge risk/);
});

test('fixed events keep distinct geometry without a forecast interval', () => {
 const m=parse('Ofgem decision 2026-12-01 [fixed]\nBuild 2026-09 .. 2026-11'),s=render(m,ctx);assert.doesNotMatch(s,/±\?/);assert.match(s,/<line data-ms="p50" data-mskey="\|ofgem decision"/);assert.match(s,/<circle data-ms="p50" data-mskey="\|build"/);assert.equal((s.match(/data-ms="whisker"/g)||[]).length,1);
});

test('a BARE single date still gets ±? — the nag survives', () => {
  const svg = render(parse('Vendor selection 2026-11\nBuild 2026-09 .. 2026-11'), ctx);
  assert.match(svg, /±\?/);
});

const MERGE = 'today: 2026-07-06\n' +
  'Grid: Energisation 2027-02 .. 2027-06\nBuild: Commissioning 2027-03 .. 2027-08\n' +
  'Consents: DCO 2027-01 .. 2027-05';
const rd = src => timelineReadout(parse(src), parseDate('2026-07-06'));

test('deadline verdict: names the fixed date and reports the joint against it', () => {
  const t = rd(MERGE + '\nOfgem decision 2027-04-01 [fixed]');
  assert.match(t, /^Fixed date: Ofgem decision, 1 Apr 2027\./);
  assert.match(t, /ranged lanes clear it together/);
  assert.match(t, /past it\./, 'a tight deadline reports d80 past it');
});

test('deadline verdict: a comfortable deadline says INSIDE it', () => {
  const t = rd(MERGE + '\nLong stop 2029-01-01 [fixed]');
  assert.match(t, /inside it\./);
  assert.doesNotMatch(t, /past it/);
});

test('deadline verdict: d80 landing on the deadline reads without contradiction', () => {
  // two-step: learn the plan's own d80, then pin the fixed date to it
  const d80 = mergeBias(parse(MERGE), parseDate('2026-07-06')).d80;
  const iso = new Date(d80 * 86400000).toISOString().slice(0, 10);
  const t = rd(MERGE + '\nGate ' + iso + ' [fixed]');
  assert.match(t, /80% joint confidence lands on the deadline day\./);
  assert.doesNotMatch(t, /0 (days|weeks)/);
});

test('HONESTY: a far-off deadline never prints a bare 100%', () => {
  const t = rd(MERGE + '\nLong stop 2035-01-01 [fixed]');   // ≫ 8.5σ ⇒ normCdf returns exactly 1
  assert.match(t, />99%/);
  assert.doesNotMatch(t, /(?<![\d.>])100%/);
});

test('HONESTY: an impossible deadline never prints a bare 0%', () => {
  const t = rd(MERGE + '\nGate 2026-07-20 [fixed]');
  assert.match(t, /<1%/);
  assert.doesNotMatch(t, /(?<![\d.<])0%/);
  assert.doesNotMatch(t, /≈ <1%/, 'never approximates an inequality');
});

test('near 80%: the verdict says which side of the line it is on', () => {
  // pin the gate one day either side of the plan's own d80. jointAt moves ~0.3
  // points/day here, so both round to 80% — exactly the case where a bare "≈ 80%"
  // next to "80% needs three more weeks" reads as a contradiction.
  const d80 = mergeBias(parse(MERGE), parseDate('2026-07-06')).d80;
  const iso = d => new Date(d * 86400000).toISOString().slice(0, 10);
  assert.match(rd(MERGE + '\nGate ' + iso(d80 - 1) + ' [fixed]'), /clear it together just under 80%/);
  assert.match(rd(MERGE + '\nGate ' + iso(d80 + 1) + ' [fixed]'), /clear it together just over 80%/);
});

test('a long fixed label survives whole — the 6b verdict wraps, so nothing is clipped', () => {
  const long = 'Ofgem determination on capacity market rules';   // 43 chars
  const src = MERGE + '\n' + long + ' 2027-04-01 [fixed]';
  const v = timelineVerdict(parse(src), parseDate('2026-07-06'));
  assert.ok(v.line.startsWith('Fixed: ' + long + ' 1 Apr 2027'), 'the in-chart line keeps the label');
  assert.doesNotMatch(render(parse(src), ctx), /capacit…/, 'the pre-wrap 30-char clip is gone');
  assert.ok(rd(src).startsWith('Fixed date: ' + long + ','), 'the prose form keeps the whole label');
});

test('the non-deadline merge sentence is untouched', () => {
  const t = rd(MERGE);
  assert.match(t, /^Merge risk: 3 ranged lanes must all land by /);
  assert.match(t, /even the last is a coin flip/);
});

test('a blown deadline is named, not silently dropped', () => {
  const t = rd(MERGE + '\nOfgem decision 2026-06-01 [fixed]');
  assert.match(t, /^Merge risk:/, 'falls back to the internal nominal end');
  assert.match(t, /fixed Ofgem decision passed 5 weeks ago/);
});

test('multiple future fixed dates disclose which one was used', () => {
  const t = rd(MERGE + '\nGate 2027-04-01 [fixed]\nLong stop 2028-01-01 [fixed]');
  assert.match(t, /^Fixed date: Long stop, 1 Jan 2028\./);
  assert.match(t, /measured against the latest of 2 fixed dates/);
});

test('one ranged lane + a deadline gets a sentence, not silence', () => {
  const t = rd('today: 2026-07-06\nGrid: Energisation 2027-02 .. 2027-06\n' +
    'Ofgem decision 2027-04-01 [fixed]');
  assert.match(t, /Grid clears the fixed Ofgem decision \(1 Apr 2027\)/);
  assert.match(t, /one lane, a planning estimate\./);
});

test('"Next up" on a fixed item says fixed, not P50', () => {
  const t = rd('today: 2026-07-06\nOfgem decision 2026-09-01 [fixed]');
  assert.match(t, /Next up: Ofgem decision — fixed 1 Sep 2026\./);
  assert.doesNotMatch(t, /P50/);
});

test('toMarkdown distinguishes fixed from an un-ranged guess', () => {
  const md = toMarkdown(parse('A 2026-09-01 [fixed]\nB 2026-10-01'), null, 'http://x');
  assert.match(md, /\| A \|[^|]*\|[^|]*\|[^|]*\| fixed \|/);
  assert.match(md, /\| B \|[^|]*\|[^|]*\|[^|]*\| no range \|/);
});

/* 2026-07-30 polish batch: metrics line, RISK pill, TODAY-flag tick dodge, note size */

test('Field header names the timing vocabulary beneath the authored title', () => {
  const svg = render(parse(DOC), ctx);
  assert.match(svg, />Timeline \/ Field</);
  assert.match(svg, />P50 finish</);
});

test('an untitled document retains the Field fallback without invented portfolio metrics', () => {
  const one = render(parse('title: T\nA 2026-08 .. 2026-09'), ctx);
  assert.match(one, />T</);
  assert.doesNotMatch(one, />\d+ MILESTONES/);
  const untitled = render(parse('A 2026-08 .. 2026-09'), ctx);
  assert.match(untitled, />Milestone timeline</);
});

test('[risk] carries a RISK pill, not colour alone', () => {
  const svg = render(parse(DOC), ctx);
  assert.equal((svg.match(/>RISK</g) || []).length, 1);
  const calm = render(parse('title: T\nA 2026-08 .. 2026-09'), ctx);
  assert.doesNotMatch(calm, />RISK</);
});

test('the Field retains a distinct TODAY reference on a short chronology', () => {
  const doc = 'title: T\ntoday: 2026-08-01\nA 2026-09-10 .. 2026-09-20\nB 2026-10-05 .. 2026-11-02';
  const svg = render(parse(doc), ctx);
  assert.match(svg, /data-today/);
  assert.match(svg, />Today ·[^<]+</);
});

test('milestone sub lines render at 11.5px (the projector bump)', () => {
  const svg = render(parse(DOC), ctx);
  assert.ok((svg.match(/font-size="14"/g) || []).length >= 4);
});

/* ---------- `verdict:` on the artefact (2026-07-31) ---------- */
test('verdict: off drops the band, and the tool\'s supporting "rest" bits with it', () => {
  const svg = render(parse('verdict: off\n' + DOC), ctx);
  assert.ok(!svg.includes('VERDICT'));
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
});

test('verdict: off also suppresses a decision-clock receipt while retaining the factual field mark', () => {
  const svg = render(parse('verdict: off\ntoday: 2026-08-01\nGate 2026-08-28 [fixed] [lead: 3w]'), ctx);
  assert.match(svg, /data-lrm/, 'the forecast field still carries the lead mark');
  const visible = svg.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/aria-label="[^"]*"/g, '');
  assert.doesNotMatch(visible, /Decision clock:/, 'off suppresses the receipt as requested');
  assert.doesNotMatch(visible, />VERDICT</);
});

test('verdict: <text> stands alone — the tool\'s operational rest is not appended to the author\'s claim', () => {
  const m = parse('verdict: We hold the energisation date\n' + DOC);
  const vd = timelineVerdict(m, ctx.today);
  assert.equal(vd.line, 'We hold the energisation date');
  assert.equal(vd.rest, '');
  assert.ok(render(m, ctx).includes('We hold the energisation date'));
});

/* ---------- explicit density + export intents ---------- */
test('live-wide sparse plans remain a Field with canonical edit targets',()=>{
  const model=parse('title: Launch decision\nApp: Beta 2026-08 .. 2026-09\nLaunch 2026-10 [fixed]');
  const svg=render(model,{...ctx,intent:'live-wide'},null,{intent:'live-wide',edit:true});
  assert.match(svg,/data-field="timeline"/);
  assert.equal((svg.match(/data-field-item=/g)||[]).length,2);
  for(const target of ['label','dates','status','removeitem','additem'])assert.match(svg,new RegExp('data-edit="'+target+'"'));
  assert.equal((svg.match(/data-ms="p50"/g)||[]).length,2);
});

test('native dense export is exhaustive and keeps a spanning interval whole',()=>{
  const lines=['title: Dense programme','Lane: Crossing programme 2026-01 .. 2029-12'];
  for(let i=0;i<20;i++)lines.push(`Lane: Event ${String(i+1).padStart(2,'0')} 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`);
  const svg=render(parse(lines.join('\n')),{...ctx,intent:'native'},null,{intent:'native'});
  assert.match(svg,/data-native=""/);
  assert.equal((svg.match(/data-field-item=/g)||[]).length,21);
  assert.match(svg,/data-field-item="lane\|crossing programme"[^>]*data-field-p90-day="2029-12-15"/);
});

test('dense live-wide uses exhaustive measured Field rows rather than a clipped board',()=>{
  const label='Long authored milestone with an operationally specific outcome and accountable owner';
  const src=Array.from({length:20},(_,i)=>`Lane: ${label} ${i+1} 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`).join('\n');
  const svg=render(parse(src),{...ctx,intent:'live-wide'},null,{intent:'live-wide',edit:true});
  assert.match(svg,/data-intent="live-wide"/);
  assert.ok(!svg.includes('>'+label+' 1</text>'),'long label must be split across measured text lines');
  for(const target of ['label','dates','status','additem'])assert.match(svg,new RegExp('data-edit="'+target+'"'));
  assert.equal((svg.match(/data-field-item=/g)||[]).length,20);
});

test('Copy PNG presentation is fixed 1920×1080 and keeps the complete Field when it fits',()=>{
  const src=Array.from({length:10},(_,i)=>`Milestone ${i+1} 2026-${String(i+1).padStart(2,'0')} .. 2026-${String(Math.min(12,i+2)).padStart(2,'0')}`).join('\n');
  const svg=render(parse(src),{...ctx,intent:'presentation'},null,{intent:'presentation'});
  assert.match(svg,/^<svg[^>]*width="1920" height="1080"/);
  assert.match(svg,/data-font-floor="22"/);
  assert.match(svg,/data-copy-field="complete"/);
  assert.equal((svg.match(/data-field-item=/g)||[]).length,10);
});

test('Field and its safe presentation refusal escape hostile authored text',()=>{
  const hostile='"><script>alert(1)</script>';
  const sparse=parse(`title: ${hostile}\nLane: ${hostile} 2026-08 .. 2026-09`);
  const dense=parse(Array.from({length:17},(_,i)=>`Lane: ${hostile} ${i} 2026-${String(1+(i%12)).padStart(2,'0')} [fixed]`).join('\n'));
  for(const [model,intent] of [[sparse,'live-wide'],[dense,'native']]){
    const svg=render(model,{...ctx,intent},null,{intent});
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
  }
  const refused=render(dense,{...ctx,intent:'presentation'},null,{intent:'presentation'});
  assert.match(refused,/data-copy-field="unavailable"/);
  assert.ok(!refused.includes('<script>'));
});

test('generated data type meets live/native 11px and presentation 22px floors',()=>{
  const medium=parse(Array.from({length:6},(_,i)=>`Lane: Event ${i+1} 2026-${String(i+1).padStart(2,'0')} .. 2026-12`).join('\n'));
  const many=parse(Array.from({length:10},(_,i)=>`Event ${i+1} 2026-${String(i+1).padStart(2,'0')} [fixed]`).join('\n'));
  const minFont=svg=>Math.min(...[...svg.matchAll(/font-size="([\d.]+)"/g)].map(match=>+match[1]));
  const variants=[
    [render(medium,{...ctx,intent:'live-wide'},null,{intent:'live-wide'}),11],
    [render(medium,{...ctx,intent:'live-narrow',width:390},null,{intent:'live-narrow'}),11],
    [render(medium,{...ctx,intent:'native'},null,{intent:'native'}),11],
    [render(many,{...ctx,intent:'presentation'},null,{intent:'presentation'}),22],
  ];
  for(const [svg,floor] of variants)assert.ok(minFont(svg)>=floor,`${minFont(svg)} < ${floor}`);
  assert.match(variants[0][0],/data-min-readable-scale="1"/);
  assert.match(variants[1][0],/data-min-readable-scale="1"/);
});
