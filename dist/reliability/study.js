import{validate,availability,ancestors,updateNode,addAlternative,disconnect,addNode,connect}from'./engine.js?v=0.9.0';
const copy=value=>structuredClone(value);
export const basisFor=scenario=>scenario==='service'?'One requested checkout completes successfully.':'One requested battery response is delivered when needed.';
export function createStudy(scenario='bess'){const basis=basisFor(scenario);return{version:1,basis,baselineBasis:basis,effortUnit:'person-days',name:'Current design',effort:0,assumptions:'',evidence:'',decision:'',variants:[]};}
export function validateStudy(s){
  if(!s||s.version!==1||!Array.isArray(s.variants)||s.variants.length>8)throw Error('A comparison holds up to eight saved designs.');
  for(const key of ['basis','baselineBasis','effortUnit','name','assumptions','evidence','decision'])if(typeof s[key]!=='string'||s[key].length>20000)throw Error('Invalid comparison text.');
  if(!Number.isFinite(s.effort)||s.effort<0||s.effort>10000)throw Error('Effort must be between 0 and 10,000.');
  const ids=new Set();for(const v of s.variants){if(typeof v.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(v.id)||ids.has(v.id))throw Error('Invalid design identifier.');ids.add(v.id);if(!['bess','service'].includes(v.scenario))throw Error('Invalid design example.');validate(v.graph);for(const key of ['basis','name','assumptions','evidence','effortUnit'])if(typeof v[key]!=='string'||v[key].length>20000)throw Error('Invalid saved design text.');if(!Number.isFinite(v.effort)||v.effort<0||v.effort>10000)throw Error('Invalid saved effort.');}
  return s;
}
export function saveDesign(study,graph,scenario='bess'){
  validateStudy(study);validate(graph);if(!study.name.trim())throw Error('Name this design before saving.');if(!study.basis.trim())throw Error('Define a successful request before comparing designs.');
  if(study.variants.length>=8)throw Error('Eight designs are saved. Remove one to make room; Undo can restore it.');
  let i=1;while(study.variants.some(v=>v.id===`design-${i}`))i++;
  const next=copy(study);next.variants.push({id:`design-${i}`,name:study.name.trim(),scenario,basis:study.basis,effort:study.effort,effortUnit:study.effortUnit,assumptions:study.assumptions,evidence:study.evidence,graph:copy(graph)});return validateStudy(next);
}
export function designRows(study,baseline){return study.variants.map(v=>({...v,probability:availability(v.graph),gain:v.basis.trim()&&v.basis===study.baselineBasis?availability(v.graph)-availability(baseline):null}));}
export function failureExplanation(graph,id){
  const n=graph.nodes.find(n=>n.id===id);if(!n||n.kind!=='component')return null;
  const upstream=ancestors(graph,id);upstream.delete(id);
  return{label:n.label,upstream:graph.nodes.filter(n=>upstream.has(n.id)&&n.kind==='component').map(n=>n.label),heldDown:availability(graph,[id]),used:ancestors(graph).has(id)};
}
// These are editable hypotheses for the built-in BESS graph, not calibrated
// recommendations. A fallback explicitly adds its own information dependency.
export function recipe(baseline,kind){
  for(const id of ['clock','feed-a','feed-b','decision','command','response'])if(!baseline.nodes.some(n=>n.id===id&&n.kind==='component'))throw Error('These starting points need the battery example pinned as baseline.');
  let graph=copy(baseline),name,effort,assumptions;
  if(kind==='improve'){
    if(graph.nodes.find(n=>n.id==='command').p>=.999)throw Error('The command channel already meets this starting point’s target. Edit its probability directly.');
    graph=updateNode(graph,'command',{p:.999});name='Improve the command channel';effort=3;assumptions='The change can raise the command channel’s own success probability to 99.9% on the same request. Confirm with failure evidence.';
  }else if(kind==='backup'){
    graph=addAlternative(graph,'command').graph;name='Back up the command channel';effort=5;assumptions='The backup has independent own failures but still depends on the decision service and its upstream data. Switching is assumed to succeed; test that assumption.';
  }else if(kind==='separate'){
    if(!graph.nodes.find(n=>n.id==='feed-b').inputs.includes('clock'))throw Error('Data feed B no longer uses Shared clock; this starting point does not fit.');
    graph=disconnect(graph,'clock','feed-b');const added=addNode(graph,'component');graph=updateNode(added.graph,added.id,{label:'Clock for feed B',p:.99});graph=connect(graph,added.id,'feed-b');name='Separate the data clocks';effort=4;assumptions='Feed B’s replacement clock has independent failure causes and provides the same usable timing information. Verify independence and data compatibility.';
  }else if(kind==='fallback'){
    const added=addAlternative(graph,'decision');graph=updateNode(added.graph,added.alternativeId,{label:'Local fallback controller',p:.97});graph.nodes.find(n=>n.id===added.alternativeId).inputs=[];
    const data=addNode(graph,'component');graph=updateNode(data.graph,data.id,{label:'Local fallback measurements',p:.99});graph=connect(graph,data.id,added.alternativeId);name='Add a local fallback';effort=8;assumptions='Local measurements and fallback control can deliver the same promised response. Confirm timing, capacity and detection/switching; these are not simulated. The command channel remains shared.';
  }else throw Error('Unknown starting point.');
  return{graph:validate(graph),name,effort,assumptions};
}
