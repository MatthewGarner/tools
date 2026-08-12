import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {layoutTree} from '../layout.js';

const measure = text => String(text).length * 6.2;
export const DENSE = `title: A deliberately difficult strategic decision
Decision
  Commit to the comprehensive partner-led launch with a longer descriptive name: -250k
    Commercial response
      Strong adoption across the first customer cohort (p=0.3): 2M to 4M
      Useful signal but material rework remains (p=0.4): 300k to 900k
      Weak demand and an expensive retreat (p=rest): -1M to -400k
  Run a carefully bounded pilot before making the full commitment: -80k
    Evidence gate
      Customer evidence
        Clear pull from the intended audience (p=0.55): 900k to 1.4M
        Ambiguous signal requiring another round (p=rest): -180k to 120k
  Hold the current course and revisit after the planning window: 0`;

const DEEP = `Root decision
  Expand
    Market gate
      Partner route
        Evidence review
          Strong signal: 100
          Weak signal: -20
  Stop: 0`;

test('dense branch extents are deterministic, bounded and non-overlapping', () => {
  const model=parse(DENSE), results=evaluate(model), before=JSON.stringify(model);
  const layout=layoutTree(model,results,{measure,intent:'native'});
  assert.equal(layout.mode,'continuation');
  assert.ok(layout.branch.items.length < layout.total);
  for(const a of layout.branch.items){
    assert.ok(a.x>=0 && a.y>=0 && a.x+a.w<=layout.branch.width+.01 && a.y+a.h<=layout.branch.height+.01);
    for(const b of layout.branch.items) if(a!==b && a.depth===b.depth)
      assert.ok(a.y+a.h<=b.y || b.y+b.h<=a.y, `${a.node.label} overlaps ${b.node.label}`);
  }
  assert.equal(JSON.stringify(model),before,'layout adds no scratch properties to the model');
});

test('register is exhaustive, ordered and preserves complete authored paths', () => {
  const model=parse(DENSE), layout=layoutTree(model,evaluate(model),{measure,intent:'native'});
  const authored=layout.entries.filter(x=>!x.node.implicit);
  assert.equal(layout.rows.length,authored.length);
  assert.deepEqual(layout.rows.map(x=>x.id),authored.map((_,i)=>'T'+String(i+1).padStart(2,'0')));
  assert.ok(layout.rows.every(x=>x.path.includes(x.node.label)));
  for(let i=1;i<layout.rows.length;i++) assert.ok(layout.rows[i].y>=layout.rows[i-1].y+layout.rows[i-1].h);
});

test('policy selection keeps every chance outcome on the chosen path', () => {
  const model=parse(DENSE), results=evaluate(model), layout=layoutTree(model,results,{measure,intent:'presentation'});
  assert.ok(layout.selected.has(results.policy.get(model.root)));
  for(const {node} of layout.entries) if(layout.selected.has(node)&&node.kind==='chance')
    node.children.forEach(child=>assert.ok(layout.selected.has(child),child.label));
});

test('narrow is an exhaustive memo rather than scaled branch geometry', () => {
  const model=parse(DENSE),layout=layoutTree(model,evaluate(model),{measure,intent:'live-narrow',width:390});
  assert.equal(layout.mode,'memo');
  assert.equal(layout.rows.length,layout.total);
  assert.equal(layout.branch,undefined);
  assert.ok(layout.width<=390 && layout.rows.every(x=>x.x+x.w<=layout.width));
});

test('narrow rows retain complete ancestry after the indentation cap', () => {
  const model=parse(DEEP),layout=layoutTree(model,evaluate(model),{measure,intent:'live-narrow',width:390});
  const deep=layout.rows.find(row=>row.node.label==='Strong signal');
  assert.equal(deep.depth,5);
  assert.equal(deep.x,48,'depth remains visually capped at three indents');
  assert.equal(deep.indentCapped,true);
  assert.equal(deep.ancestry,'Root decision › Expand › Market gate › Partner route › Evidence review');
  assert.ok(deep.ancestryLines.length>0);
  assert.ok(deep.ancestryLines.join(' ').includes('Root decision'));
  assert.ok(deep.h>layout.rows.find(row=>row.node.label==='Stop').h,'breadcrumb height is content-driven');
});
