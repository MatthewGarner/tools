import {test} from 'node:test';
import assert from 'node:assert/strict';
import {treeLayout} from '../layout-tree.js';
import {renderTree} from '../render-tree.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#ffffff', panel:'#f7f7f7', ink:'#222222', muted:'#666666', line:'#cccccc',
  accent:'#3355aa', yes:'#228844', no:'#aa3344', warning:'#bb7700',
  status:{risk:'#cc8800', blocked:'#bb2233'},
};
const ctx = {colors, measure, dark:false, today:'2026-08-10'};

function decision(key, name, extra = {}){
  return {key, decision:{key, displayName:name, srcLine:1, ...extra},
    displayState:{kind:extra.effectiveAnswer ? 'answered' : 'open', direction:extra.effectiveAnswer},
    arms:{yes:[], no:[]}, stump:null};
}

function fixture(){
  const alpha = decision('alpha', 'Alpha');
  const beta = decision('beta', 'Beta');
  const gamma = decision('gamma', 'Gamma', {effectiveAnswer:'yes', answer:null});
  const items = {
    included:{title:'Included <work>', lane:'Lane & one', state:'in-plan'},
    ghost:{title:'Spare work', lane:'Lane two', state:'not-needed'},
    pending:{title:'Pending work', lane:'Lane three', state:'waiting', waitingFor:'alpha',
      parentDecision:'alpha', condition:{terms:[{key:'alpha'}]}},
    assumedYes:{title:'Assumed yes work', lane:'Lane four', state:'assumed-yes',
      parentDecision:'gamma', condition:{terms:[{key:'gamma'}]}},
    assumedNo:{title:'Assumed no work', lane:'Lane five', state:'assumed-no',
      parentDecision:'gamma', condition:{terms:[{key:'gamma', negated:true}]}},
  };
  alpha.arms.yes = [items.pending];
  beta.arms.yes = [items.ghost];
  gamma.arms.yes = [items.assumedYes, items.assumedNo];
  return {
    projection:{today:'2026-08-10', spine:[items.included], questions:[alpha, beta, gamma],
      breadcrumbs:[], unplaced:[], warnings:[], reachDenominator:1},
    items,
  };
}

test('item treatments carry distinct visuals and exact display copy', () => {
  const {projection} = fixture();
  const svg = renderTree(projection, treeLayout(projection, {width:1400, measure}), ctx);
  assert.match(svg, /data-treatment="normal"[^>]*>.*?Included/s);
  assert.match(svg, /data-treatment="ghost" opacity="0\.68"[^>]*>.*?Not needed/s);
  assert.match(svg, /data-treatment="conditional"[^>]*>.*?Waiting for Alpha/s);
  assert.match(svg, /data-treatment="assumed-yes"[^>]*>.*?url\(#tree-assumed-yes\).*?Following an assumed yes/s);
  assert.match(svg, /data-treatment="assumed-no"[^>]*>.*?url\(#tree-assumed-no\).*?Following an assumed no/s);
});

test('an answered question paints its collapsed stump exactly once with its count', () => {
  const q = decision('answer', 'Ship?', {effectiveAnswer:'yes', answer:'yes'});
  q.arms.yes = [{title:'Ship it', lane:'Delivery', parentDecision:'answer',
    condition:{terms:[{key:'answer'}]}}];
  q.stump = {side:'no', items:[{title:'One'}, {title:'Two'}], count:2};
  const projection = {today:'2026-08-10', spine:[], questions:[q], breadcrumbs:[], unplaced:[], warnings:[]};
  const svg = renderTree(projection, treeLayout(projection, {width:700, measure}), ctx);
  assert.equal((svg.match(/data-kind="stump"/g) || []).length, 1);
  assert.equal((svg.match(/>\+2<\/text>/g) || []).length, 1);
  assert.doesNotMatch(svg, />One<|>Two</);
});

test('model-derived decision, title, and lane strings are XML-escaped', () => {
  const {projection} = fixture();
  projection.questions[0].decision.displayName = 'Choose <Alpha> & "friends"';
  const svg = renderTree(projection, treeLayout(projection, {width:1400, measure}), ctx);
  assert.match(svg, /Choose &lt;Alpha&gt; &amp; &quot;friends&quot;/);
  assert.match(svg, /Included &lt;work&gt;/);
  assert.match(svg, /Lane &amp; one/);
  assert.doesNotMatch(svg, /Choose <Alpha>|Included <work>|Lane & one/);
});

test('display copy never leaks evaluator identifiers', () => {
  const {projection} = fixture();
  projection.questions[0].decision.availability = 'dormant';
  projection.questions[1].decision.availability = 'moot';
  projection.spine[0].provenance = {kind:'enumerable', world:'limbo'};
  const svg = renderTree(projection, treeLayout(projection, {width:1400, measure}), ctx);
  for(const identifier of ['moot', 'dormant', 'world', 'limbo', 'provenance', 'enumerable',
    'in-plan', 'not-needed', 'waiting']) assert.doesNotMatch(svg, new RegExp(identifier));
  for(const label of ['Open', 'Included', 'Not needed', 'Waiting for Alpha',
    'Following an assumed yes', 'Following an assumed no']) assert.match(svg, new RegExp(label));
});

test('status remains a small tag while conditional treatment owns the card', () => {
  const q = decision('alpha', 'Alpha');
  q.arms.yes = [{title:'At risk', lane:'Ops', status:'risk', state:'waiting', waitingFor:'alpha',
    parentDecision:'alpha', condition:{terms:[{key:'alpha'}]}}];
  const projection = {today:'2026-08-10', spine:[], questions:[q], breadcrumbs:[], unplaced:[], warnings:[]};
  const svg = renderTree(projection, treeLayout(projection, {width:700, measure}), ctx);
  const group = svg.match(/<g data-treatment="conditional"[\s\S]*?<\/g>/)?.[0] || '';
  assert.match(group, /fill="#bb770014"[^>]*stroke="#bb7700"/);
  assert.match(group, /fill="#cc88001F"[^>]*stroke="#cc8800"/);
  assert.equal((group.match(/fill="#cc88001F"/g) || []).length, 1);
});

test('unplaced items appear in a labelled band', () => {
  const item = {title:'Loose work', lane:'Later', condition:{terms:[{key:'unknown'}]}};
  const projection = {today:'2026-08-10', spine:[], questions:[], breadcrumbs:[], unplaced:[item], warnings:[]};
  const svg = renderTree(projection, treeLayout(projection, {width:700, measure}), ctx);
  assert.match(svg, /data-kind="unplaced"/);
  assert.match(svg, />Unplaced<\/text>/);
  assert.match(svg, />Loose work<\/text>/);
});

test('all fill and stroke hex colours have XML-safe lengths', () => {
  const {projection} = fixture();
  const shortCtx = {...ctx, colors:{...colors, ink:'#222', muted:'#777'}};
  const svg = renderTree(projection, treeLayout(projection, {width:1400, measure}), shortCtx);
  const valid = new Set([3, 4, 6, 8]);
  for(const match of svg.matchAll(/(?:fill|stroke)="#([0-9a-fA-F]+)"/g)){
    assert.ok(valid.has(match[1].length), match[0]);
  }
});

test('SVG tags use quoted attributes and form well-formed XML-level tags', () => {
  const {projection} = fixture();
  const svg = renderTree(projection, treeLayout(projection, {width:1400, measure}), ctx);
  const tag = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const candidate of svg.match(/<[^!/][^>]*>/g) || []) assert.match(candidate, tag, candidate);
  assert.equal(svg.includes(' '), false);
});
