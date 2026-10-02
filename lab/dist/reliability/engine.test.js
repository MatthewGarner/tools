import test from 'node:test';
import assert from 'node:assert/strict';
import {example,availability,liveState,connect,disconnect,addAlternative,addCommonDependency,improvements,validate,updateNode} from './engine.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const c=(id,p,inputs=[])=>({id,label:id,kind:'component',p,inputs,x:0,y:0});
const gate=(id,type,inputs)=>({id,label:id,kind:'gate',gate:type,inputs,x:0,y:0});
test('series and independent alternatives have their exact familiar probabilities',()=>{
  close(availability({output:'b',nodes:[c('a',.9),c('b',.8,['a'])]}),.72);
  close(availability({output:'out',nodes:[c('a',.9),c('b',.8),gate('out','OR',['a','b'])]}),.98);
});
test('a shared dependency counts once and limits the benefit of alternatives',()=>{
  const graph={output:'out',nodes:[c('shared',.9),c('a',.8,['shared']),c('b',.8,['shared']),gate('out','OR',['a','b'])]};
  close(availability(graph),.9*(1-.2*.2));assert.notEqual(availability(graph),1-(1-.72)**2);
  close(availability(graph,['shared']),0);assert.equal(liveState(graph,['a']).success,true);assert.equal(liveState(graph,['shared']).success,false);
});
test('holding a component down conditions the system, rather than multiplying by the chance of its outage',()=>{
  const graph={output:'out',nodes:[c('a',.99),c('b',.7),gate('out','OR',['a','b'])]};close(availability(graph,['a']),.7);close(availability(graph,['a','b']),0);
  assert.throws(()=>availability(graph,['out']),/Only a component/);
});
test('alternatives inherit dependencies and cannot repair a common failure',()=>{
  const graph={output:'b',nodes:[c('a',.8),c('b',.9,['a'])]};const added=addAlternative(graph,'b');close(availability(added.graph),.8*.99);assert.ok(availability(added.graph)>availability(graph));close(availability(added.graph,['a']),0);
  const shared=addCommonDependency(added.graph,['b',added.alternativeId]);close(availability(shared.graph),.8*.99*.99);close(availability(shared.graph,[shared.id]),0);
});
test('cycles, invalid probabilities, missing references and overlarge graphs fail before mutation',()=>{
  const graph={output:'b',nodes:[c('a',.8),c('b',.9,['a'])]};assert.throws(()=>connect(graph,'b','a'),/cycle/);assert.deepEqual(graph.nodes[0].inputs,[]);assert.throws(()=>connect(graph,'a','a'),/cycle/);assert.throws(()=>updateNode(graph,'a',{p:1.1}),/between/);assert.throws(()=>validate({...graph,nodes:[c('a',.8,['missing']),c('b',.9)]}),/missing/);assert.throws(()=>validate({output:'n0',nodes:Array.from({length:11},(_,i)=>c(`n${i}`,.9))}),/At most/);
});
test('empty gates fail explicitly, while unplugging a component removes that requirement',()=>{
  close(availability({output:'out',nodes:[gate('out','AND',[])]}),0);close(availability({output:'out',nodes:[gate('out','OR',[])]}),0);
  const graph={output:'b',nodes:[c('a',.8),c('b',.9,['a'])]};close(availability(disconnect(graph,'a','b')),.9);
});
test('improvement ranking measures whole-system gain, including irrelevant nodes',()=>{
  const graph={output:'b',nodes:[c('a',.8),c('b',.99,['a']),c('unused',.1)]};const ranked=improvements(graph);assert.equal(ranked[0].id,'a');close(ranked[0].gain,.99-.8*.99);close(ranked.find(n=>n.id==='unused').gain,0);
});
test('availability is monotone for AND/OR networks and bounded across edited examples',()=>{
  for(const name of ['bess','service']){const graph=example(name),base=availability(graph);assert.ok(base>0&&base<1);for(const n of graph.nodes.filter(n=>n.kind==='component')){assert.ok(availability(updateNode(graph,n.id,{p:1}))>=base-1e-12);assert.ok(availability(graph,[n.id])<=base+1e-12);const live=liveState(graph,[n.id]);assert.equal(typeof live.success,'boolean');}}
});
