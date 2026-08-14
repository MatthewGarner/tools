import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const app = readFileSync(new URL('app.js', root), 'utf8');
const css = readFileSync(new URL('style.css', root), 'utf8');

test('learning close-out preserves the four primary whole-plan views', () => {
  const primary = [...html.matchAll(/data-paths-view="(brief|agenda|question|conditions)"/g)].map(match => match[1]);
  assert.deepEqual(primary, ['brief', 'agenda', 'question', 'conditions']);
  assert.doesNotMatch(html, /data-paths-view="closeout"/);
  assert.doesNotMatch(html, />\s*Close-out\s*<\/button>/i);
});

test('close-out is entered from and returns to the selected decision receipt on desktop and phone', () => {
  assert.match(app, /dataset\.openCloseout/);
  assert.match(app, /dataset\.returnCloseout/);
  assert.match(app, /overviewMode = 'closeout'/);
  assert.match(app, /Return to decision receipt/);
  assert.match(app, /renderLearningCloseOutDetail\(host, \{sheet\}\)/);
  assert.match(css, /\.overview-receipt\[data-closeout-detail="true"\]/);
  assert.match(css, /\.overview-live\[data-mode="closeout"\]\{\s*display:grid; grid-template-columns:minmax\(0,1fr\);/);
  assert.match(css, /\.overview-live\[data-mode="closeout"\] \.overview-receipt\[data-closeout-detail="true"\]/);
  assert.match(app, /focusCloseOutReturnAfterRender = true;[\s\S]*?refresh\(\);/);
});

test('the close-out action keeps a 44px target in the narrow receipt sheet', () => {
  assert.match(css, /@media \(max-width:520px\)\{\s*\/\*[\s\S]*?\*\/\s*\.receipt-closeout-open\{min-height:44px\}/);
});

test('full exports retain their established selected-decision context while Close-out alone is scoped', () => {
  assert.match(html, /Selected learning close-out · SVG/);
  assert.match(html, /Selected learning close-out · PNG/);
  /* Decision: Brief, Question lens and Conditions stay complete whole-plan
     exports with their existing selected context; no semantic change here.
     Learning Agenda deliberately omits transient selection, and Close-out is
     the only selected-decision scoped export. */
  assert.match(app, /if\(style === 'brief'\) return renderOverview\(overview,[\s\S]*selectedKey:selectedOverviewDecision\?\.key/);
  assert.match(app, /if\(style === 'question'\) return renderQuestionLens\(overview,[\s\S]*selectedKey:selectedOverviewDecision\?\.key/);
  assert.match(app, /if\(style === 'conditions'\) return renderConditions\(overview,[\s\S]*selectedKey:selectedOverviewDecision\?\.key/);
  assert.match(app, /renderLearningAgenda\(overview,[\s\S]*selection:false/);
  assert.match(app, /selectedCloseOutReceiptSvg/);
});

test('author-stated boundary and canonical source editing are present in the focused layer', () => {
  assert.match(app, /not evidence, causal, or research-quality certification/);
  assert.match(app, /does not alter this answer, the Paths plan, or any Roadmap projection/);
  assert.match(app, /setCloseOutField\(editor\.getText\(\)/);
  assert.match(app, /Reviews and retirements are append-only source events/);
});
