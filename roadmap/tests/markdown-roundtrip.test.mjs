import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {roadmapToMarkdown, markdownToRoadmapDsl} from '../markdown.js';

const dir = new URL('../../dev/fixtures/export-stress/roadmap/', import.meta.url);
const key = it => JSON.stringify([it.title, it.note || '', it.lane || '', it.h, it.status || null, it.span || 1, it.bet ? [it.bet.name, it.bet.outcome || ''] : null, it.cond ? [it.cond.when, it.cond.name] : null]);
const same = (a, b) => ({
  title: a.title === b.title, headline: a.headline === b.headline, story: a.story === b.story, verdict: (a.verdict ?? null) === (b.verdict ?? null),
  date: (a.dateStr ?? null) === (b.dateStr ?? null), horizons: JSON.stringify(a.horizons) === JSON.stringify(b.horizons), lanes: JSON.stringify([...a.lanes].sort()) === JSON.stringify([...b.lanes].sort()),
  items: JSON.stringify(a.items.map(key).sort()) === JSON.stringify(b.items.map(key).sort()),
});

for(const file of readdirSync(dir).filter(f => f.endsWith('.txt'))){
  test(`M1: Markdown copy of ${file} imports back to the same plan`, () => {
    const a = parse(readFileSync(new URL(file, dir), 'utf8'));
    const b = parse(markdownToRoadmapDsl(roadmapToMarkdown(a, {href: 'https://example.test/'})));
    const result = same(a, b);
    assert.deepEqual(Object.entries(result).filter(([, ok]) => !ok).map(([k]) => k), [], file);
  });
}

test('M1: date, verdict, headline and story survive, and an editor setting already in place is not part of the copy', () => {
  const a = parse('title: Lantern\ndate: 2026-11-12\nheadline: Retention first\nstory: Why it moved\nverdict: Ship the sync work first\nwip: 3\nNow\nCore: One');
  const md = roadmapToMarkdown(a, {href: ''});
  assert.doesNotMatch(md, /wip/);
  const b = parse(markdownToRoadmapDsl(md));
  assert.equal(b.headline, 'Retention first'); assert.equal(b.story, 'Why it moved'); assert.equal(b.verdict, 'Ship the sync work first'); assert.equal(b.dateStr, '2026-11-12');
});

test('M2: a dash, an arrow or a status-looking word inside a title or note does not change how it is read back', () => {
  const a = parse('Now\nCore: Sync — the rewrite [doing] -- Notes — with a dash, and more — still note\nCore: Plain title -- A note');
  const b = parse(markdownToRoadmapDsl(roadmapToMarkdown(a, {href: ''})));
  const t = parsed => parsed.items.map(it => [it.title, it.note]);
  assert.deepEqual(t(b), t(a));
  assert.match(roadmapToMarkdown(a, {href: ''}), /Sync &mdash; the rewrite/);
});
