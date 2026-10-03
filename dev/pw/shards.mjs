/* CI packing uses measured Actions timings, not local duration hints.
   Baseline 37069814521: test steps 381/249/209/233/191s.
   First revision 37075747671: 247/241/236/260/240s; WebKit setup also
   took 40s versus 21–29s elsewhere. Move its 19s design-bar to mobile and
   7s case to layout to balance the complete job, including setup.
   Local runs use a work-stealing pool instead of these fixed shards. */
export const SHARDS = [
  {name:'smoke', suites:['lab-migration.mjs','backup.mjs','suite.mjs','templates.mjs','identity.mjs','smoke.mjs','gauge.mjs','timeline.mjs'], browsers:'chromium'},
  {name:'eip', suites:['check-eip.mjs'], browsers:'chromium'},
  {name:'mobile-core', suites:['mobile.mjs','pwa.mjs','pwa-upgrade.mjs','recent-work.mjs','chapter-interactions.mjs','design-bar.mjs'], browsers:'chromium'},
  {name:'motion-webkit', suites:['motion.mjs','webkit.mjs','check.mjs','paths-budget.mjs','map.mjs'], browsers:'chromium webkit'},
  {name:'layout-gauge', suites:['chapter.mjs','energy-design-bar.mjs','workshop-design.mjs','layout.mjs','signal.mjs','intraday-export.mjs','frequency.mjs','case.mjs'], browsers:'chromium'},
];

export const ALL_SUITES = SHARDS.flatMap(s => s.suites);

/* Local ordering hints, not CI budgets. CI packing uses the measured run above. */
export const SUITE_SECONDS = {
  'lab-migration.mjs': 10,
  'backup.mjs': 10,
  'suite.mjs': 30, // Initial consolidation journey hint; revise from measured gate.
  'recent-work.mjs': 60,
  'templates.mjs': 20,
  // Initial ordering hints for the design-bar regressions; refine from the complete gate.
  'identity.mjs': 12, 'design-bar.mjs': 10, 'energy-design-bar.mjs': 12, 'workshop-design.mjs': 25,
  // Initial ordering hints for Chapter; update from the first complete gate run.
  'chapter.mjs': 45, 'chapter-interactions.mjs': 20, 'timeline.mjs': 20,
  'smoke.mjs': 147, 'check-eip.mjs': 208, 'paths-budget.mjs': 28, 'mobile.mjs': 170, 'motion.mjs': 56,
  'layout.mjs': 103, 'webkit.mjs': 56, 'gauge.mjs': 27, 'check.mjs': 30,
  'pwa.mjs': 15, 'pwa-upgrade.mjs': 4, 'signal.mjs': 4, 'map.mjs': 5, 'case.mjs': 3,
  'intraday-export.mjs': 24, 'frequency.mjs': 10,
};

/* Legacy/manual JSON view of the complete partition. CI uses ci-plan.mjs to
   select suites, preserving this file as the single partition definition. */
if(process.argv.includes('--json')){
  process.stdout.write(JSON.stringify(SHARDS.map(s => ({
    name: s.name,
    suites: s.suites.join(' '),
    browsers: s.browsers,
    cachekey: s.browsers.replace(/ /g, '-'),
  }))));
}
