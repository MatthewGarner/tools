/* The artefact-first shell's single source of facts, one entry per Product and
   Energy page. Phase 0 only records and measures: nothing here changes a page.
   Later phases stamp each page's header from it and flip `anchorBudget` and
   `shell` per page as the page earns them. dev/pw/first-screen.mjs reads it.

   Capabilities are seeded from what each page does today, not redesigned.
     new        the page has a real blank start (spec 9a). False where there are
                templates but no blank: File then shows "New from template…"
     examples   example chips sit in the header or a row above the anchor, so
                File lists them. Presets inside the working surface stay put
                and leave this false (fermi, alarm)
     templates  recent-work.js mounts Templates / New from template. False
                exactly for alarm, flow, signal-vs-noise, case, paths, frequency
     share      a link built from the tool's own state reopens the whole model.
                True for the ten tools that call mountModelLink today, and for
                every other tool whose link was proved to round-trip by opening
                it in a fresh browser context. False only for gauge: its link
                carries the question set but not the live session.
     shell      the page's header is stamped by dev/sync-shell.mjs (File, Share)
     anchor     CSS selector for where the working surface starts, visible on
                first load with no interaction
   `name` equals the catalogue title (assets/suite-catalog.js);
   dev/shell-manifest.test.mjs asserts it. Today's page h1s differ on several
   tools; stamping the header from this field is what fixes that. */

/* Spec section 2. Positions are CSS px from the top of the document. */
export const HEADER_BUDGET = Object.freeze({phone: 215, laptop: 180});
export const ANCHOR_BUDGET = Object.freeze({phone: 280, laptop: 240});
export const HEADER_CONTROLS_MAX = 2;
/* An anchor must be a real surface, not a sliver or an empty container. */
export const ANCHOR_MIN_SIZE = Object.freeze({width: 100, height: 40});
export const VIEWPORTS = Object.freeze({
  phone: Object.freeze({width: 375, height: 812}),
  laptop: Object.freeze({width: 1280, height: 800}),
});

/* items: tool-specific File entries, [{id, label}]; the page attaches the behaviour. */
const page = (name, anchor, {new: fresh, examples, templates, share, items = []}) =>
  Object.freeze({name, anchor, new: fresh, examples, templates, share, items: Object.freeze(items), anchorBudget: false, shell: false});

export const SHELL_MANIFEST = Object.freeze(Object.fromEntries(Object.entries({
  fermi: {...page('Fermi', '#results', {new: false, examples: false, templates: true, share: true}), shell: true},
  rank: {...page('Rank', '#tbl', {new: true, examples: true, templates: true, share: true}), shell: true},
  roadmap: {...page('Roadmap', '#preview', {new: true, examples: true, templates: true, share: true, items: [{id: 'import-markdown', label: 'Import markdown'}]}), shell: true},
  why: {...page('Why', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  tree: {...page('Tree', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  map: {...page('Map', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  gauge: page('Gauge', '#preview', {new: true, examples: true, templates: true, share: false}),
  flow: {...page('Flow', '#strip', {new: false, examples: false, templates: false, share: true}), shell: true},
  timeline: page('Timeline', '#preview', {new: true, examples: true, templates: true, share: true}),
  wardley: {...page('Wardley', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  alarm: {...page('Alarm', '#distwrap', {new: false, examples: false, templates: false, share: true}), shell: true},
  duel: {...page('Duel', '#setupcard', {new: false, examples: false, templates: true, share: true}), shell: true},
  premortem: page('Premortem', '#wizardview', {new: true, examples: false, templates: true, share: true}),
  bets: {...page('Bets', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  'signal-vs-noise': page('Signal vs noise', '#stage', {new: false, examples: false, templates: false, share: true}),
  case: page('Case file', '#preview', {new: true, examples: true, templates: false, share: true}),
  paths: {...page('Paths', '#preview', {new: true, examples: true, templates: false, share: true}), shell: true},
  proxy: {...page('Proxy Hunt', '#preview', {new: true, examples: true, templates: true, share: true}), shell: true},
  cycles: page('Cycle budget', '#preview', {new: true, examples: true, templates: true, share: true}),
  risk: page('Risk transfer', '#preview', {new: true, examples: true, templates: true, share: true}),
  frequency: page('Frequency & inertia', '#trace', {new: false, examples: true, templates: false, share: true}),
  'merit-order': page('Merit order', '#chartwrap', {new: true, examples: true, templates: true, share: true}),
  intraday: page('A day through the stack', '#stackwrap', {new: true, examples: true, templates: true, share: true}),
}).map(([dir, entry]) => [dir, Object.freeze(entry)])));
