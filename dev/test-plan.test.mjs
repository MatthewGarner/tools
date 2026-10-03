import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {planChanges,dependencyEdges,changedPaths,expandTools,SUITES,SUITE_TOOLS,FILTER_TOOLS,toolPlan} from './test-plan.mjs';
import {createScope} from './pw/_scope.mjs';
import {matrixFor} from './ci-plan.mjs';

test('documentation is a path allowlist, not a Markdown extension exemption', () => {
  assert.equal(planChanges(['docs/agent/TESTING.md','README.md']).mode,'docs');
  assert.equal(planChanges(['rank/README.md','energy/README.md']).mode,'docs');
  assert.equal(planChanges(['rank/example.md']).mode,'affected');
  assert.equal(planChanges(['unknown.md']).mode,'full');
});
test('isolated calculator selects browser witnesses without unrelated editing journeys', () => {
  const plan=planChanges(['rank/engine.js']);
  assert.equal(plan.mode,'affected'); assert.deepEqual(plan.tools,['rank']);
  for(const suite of ['smoke.mjs','mobile.mjs','webkit.mjs']) assert.ok(plan.suites.includes(suite));
  for(const suite of ['check-eip.mjs','gauge.mjs','layout.mjs']) assert.ok(!plan.suites.includes(suite));
});
test('shared paths, unknown owners, removals and uncertain imports fail closed', () => {
  for(const path of ['assets/workspace.js','api/gauge/_lib.js','dev/pw/mobile.mjs','new-tool/app.js'])
    assert.equal(planChanges([path]).mode,'full',path);
  assert.equal(planChanges(['rank/app.js'],{deleted:['rank/app.js']}).mode,'full');
  assert.equal(planChanges(['rank/app.js'],{uncertain:'computed import'}).mode,'full');
});
test('consumer closure includes transitive imports and both handoff endpoints', () => {
  const graph=dependencyEdges([
    ['case/model.js',"import {read} from '../map/readout.js';"],
    ['roadmap/model.js',"export {read} from '../case/model.js';"],
    ['rank/style.css','@import url(../tree/style.css);'],
  ]);
  const affected=planChanges(['map/readout.js'],graph).tools;
  for(const tool of ['case','roadmap','paths','gauge','fermi']) assert.ok(affected.includes(tool),tool);
  assert.ok(planChanges(['tree/style.css'],graph).tools.includes('rank'));
  assert.ok(expandTools(['premortem'],graph.edges).includes('timeline'));
});
test('a tool referenced by shared code selects full rather than losing indirect consumers', () => {
  const graph=dependencyEdges([['assets/shared.js',"import '../rank/engine.js';"]]);
  assert.equal(planChanges(['rank/engine.js'],graph).mode,'full');
});
test('catalogue links and unrelated vendor imports do not fan out a tool edit', () => {
  const graph=dependencyEdges([
    ['home/index.html','<a href="/rank/">Rank</a>'],
    ['rank/app.js',"import '../roadmap/vendor/codemirror.js';"],
  ]);
  assert.equal(planChanges(['rank/engine.js'],graph).mode,'affected');
  assert.ok(!planChanges(['roadmap/parse.js'],graph).tools.includes('rank'));
  assert.ok(planChanges(['roadmap/vendor/codemirror.js'],graph).tools.includes('rank'));
});
test('computed imports refuse to guess dependency scope', () => {
  assert.ok(dependencyEdges([['rank/app.js','import(modulePath)']]).uncertain);
  assert.ok(dependencyEdges([['rank/app.js',"import('../tree/' + name + '.js')"]]).uncertain);
  assert.ok(dependencyEdges([['rank/app.js',"new Worker('../tree/' + name + '.js')"]]).uncertain);
  assert.ok(dependencyEdges([['rank/app.js','import(`../${tool}/app.js`)']]).uncertain);
});
test('comments cannot hide computed imports or workers from dependency selection', () => {
  const calls = [
    'import /* load */ (target)',
    'import // load\n(target)',
    'import // load\r(target)',
    'new /* load */ Worker(target)',
    'new // load\nWorker(target)',
    'new Worker /* load */ (target)',
    'new Worker // load\n(target)',
  ];
  for(const call of calls){
    const source = "const target = '../' + route + '/engine.js'; " + call;
    assert.doesNotThrow(() => new Function('route', source));
    const graph = dependencyEdges([['rank/app.js',source]]);
    // The consumer is unchanged: editing Tree must not silently omit Rank.
    assert.equal(planChanges(['tree/engine.js'],graph).mode,'full',call);
  }
  for(const call of [
    "import /* load */ ('../tree/engine.js')",
    "new /* load */ Worker /* start */ ('../tree/engine.js')",
  ]){
    const graph = dependencyEdges([['rank/app.js',call]]);
    assert.equal(graph.uncertain,undefined,call);
    assert.ok(planChanges(['tree/engine.js'],graph).tools.includes('rank'),call);
  }
});
test('verified generated workers do not turn an owned edit into global browser work', () => {
  const files=['rank/engine.js','home/sw.js'];
  assert.equal(planChanges(files).mode,'full');
  assert.equal(planChanges(files,{generated:['home/sw.js']}).mode,'affected');
  assert.equal(planChanges(['home/sw.js'],{generated:['home/sw.js']}).mode,'full');
});
test('suite metadata covers the executable chain, including every filterable suite', () => {
  assert.deepEqual(Object.keys(SUITE_TOOLS).sort(),[...SUITES].sort());
  for(const [suite,tools] of Object.entries(FILTER_TOOLS)){
    assert.ok(tools.length); assert.equal(new Set(tools).size,tools.length);
    assert.ok(tools.every(t=>SUITE_TOOLS[suite].includes(t)));
  }
  assert.throws(()=>toolPlan(['made-up-tool']),/Unknown tool/);
});
test('filtered coverage cannot be satisfied by unscoped metadata or another tool', () => {
  const scope=createScope(['rank','tree'],['rank']);
  scope.unscoped();scope.checked(); assert.throws(()=>scope.validate(),/rank/);
  assert.equal(scope.wants('tree'),false);scope.checked(); assert.throws(()=>scope.validate(),/rank/);
  assert.equal(scope.wants('rank'),true);scope.checked();scope.validate();
  assert.deepEqual(scope.counts,{rank:1});
});
test('full scopes require a witness for every owned tool, and focused empty scopes fail', () => {
  const scope=createScope(['rank','tree']);scope.wants('rank');scope.checked();
  assert.throws(()=>scope.validate(),/tree/);
  scope.wants('tree');scope.checked();scope.validate();
  assert.throws(()=>createScope(['rank'],['tree']),/no supported/);
});
test('CI matrix neither duplicates nor loses selected suites; no-work is explicit', () => {
  for(const plan of [planChanges(['assets/workspace.js']),planChanges(['rank/engine.js'])]){
    const matrix=matrixFor(plan);
    assert.deepEqual(matrix.flatMap(s=>s.suites.split(',')).sort(),[...plan.suites].sort());
    assert.equal(matrix.find(s=>s.suites.includes('webkit.mjs')).browsers,'chromium webkit');
  }
  assert.deepEqual(matrixFor(planChanges(['README.md'])).map(s=>s.suites),['']);
  assert.throws(()=>matrixFor({mode:'oops',suites:[]}),/Invalid CI/);
  assert.throws(()=>matrixFor({mode:'full',suites:[],tools:[]}),/cover every suite/);
  assert.throws(()=>matrixFor({mode:'affected',suites:[],tools:['rank']}),/contain selected work/);
});
test('Git collection includes branch, staged, unstaged, untracked and both rename paths', () => {
  const cwd=mkdtempSync(join(tmpdir(),'test-plan-git-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Test');
    for(const f of ['old.js','unstaged.js','staged.js','opposing.js'])writeFileSync(join(cwd,f),'initial');
    git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
    writeFileSync(join(cwd,'branch.js'),'branch');git('add','.');git('commit','-qm','branch');
    git('mv','old.js','new.js');
    writeFileSync(join(cwd,'staged.js'),'staged');git('add','staged.js');
    writeFileSync(join(cwd,'unstaged.js'),'unstaged');
    writeFileSync(join(cwd,'opposing.js'),'staged change');git('add','opposing.js');
    writeFileSync(join(cwd,'opposing.js'),'initial');
    writeFileSync(join(cwd,'untracked\nfile.js'),'untracked');
    assert.deepEqual(changedPaths({base,cwd}).sort(),['branch.js','old.js','new.js','staged.js','unstaged.js','opposing.js','untracked\nfile.js'].sort());
    assert.deepEqual(changedPaths({base,cwd,local:false}),['branch.js']);
    assert.throws(()=>changedPaths({base:'missing-ref',cwd}));
  }finally{rmSync(cwd,{recursive:true,force:true});}
});
