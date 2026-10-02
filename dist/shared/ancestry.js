// Shared, finite source snapshots. Keep live ideas separate from what a child
// inherited; recursively copying ancestors would grow every successive export.
const clone=x=>structuredClone(x);
const text=v=>{if(typeof v!=='string'||v.length>20000)throw Error('Ancestry text must be at most 20,000 characters.');return v;};
export const blankAncestry=()=>({version:1,parents:[],parked:false});
export function sourceSnapshot(id,title,fields){const result={id,title,fields:clone(fields)};validateSnapshot(result);return result;}
function validateSnapshot(s){if(!s||typeof s!=='object')throw Error('Missing source snapshot.');text(s.id);text(s.title);if(!s.id||!Array.isArray(s.fields)||s.fields.length>160)throw Error('Invalid source snapshot.');for(const f of s.fields){text(f.label);text(f.text);}}
export function ancestry(value=blankAncestry()){
 if(!value||value.version!==1||!Array.isArray(value.parents)||value.parents.length>2||typeof value.parked!=='boolean')throw Error('Invalid idea ancestry.');
 value.parents.forEach(validateSnapshot);if(new Set(value.parents.map(p=>p.id)).size!==value.parents.length)throw Error('Choose two different parents.');return clone(value);
}
export const derivedFrom=sources=>ancestry({version:1,parents:sources,parked:false});
export function validateGraph(items){
 const byId=new Map(items.map(n=>[n.id,n]));if(byId.size!==items.length)throw Error('Ideas need distinct identifiers.');
 const visited=new Set(),path=new Set();
 const visit=id=>{if(path.has(id))throw Error('An idea cannot descend from itself.');if(visited.has(id))return;const n=byId.get(id);if(!n)return;path.add(id);for(const p of ancestry(n.ancestry).parents)visit(p.id);path.delete(id);visited.add(id);};items.forEach(n=>visit(n.id));
}
export const hasDescendants=(items,id)=>items.some(n=>n.ancestry?.parents.some(p=>p.id===id));
export function generations(items){validateGraph(items);const byId=new Map(items.map(n=>[n.id,n])),memo=new Map();const level=id=>{if(memo.has(id))return memo.get(id);const parents=byId.get(id)?.ancestry?.parents.filter(p=>byId.has(p.id))??[];const depth=parents.length?1+Math.max(...parents.map(p=>level(p.id))):0;memo.set(id,depth);return depth;};return items.map(n=>({...n,generation:level(n.id)}));}
export function ancestryMarkdown(value){const a=ancestry(value);return [a.parked?'Status: parked':'',...a.parents.flatMap(p=>[`### Parent snapshot: ${p.title||'Untitled idea'}`,`Source ID: ${p.id}`,...p.fields.map(f=>`**${f.label}:** ${f.text||'—'}`)])].filter(Boolean).join('\n\n');}

// Keep the complete saved workspace exportable after adding bounded snapshots.
// A failed branch must leave the existing workspace usable and recoverable.
export function assertPortable(value,max=7999000){
 // The importer checks file bytes. Count the formatted export envelope and UTF-8
 // characters, not compact JSON length, so a valid save can be reimported.
 const exported=JSON.stringify({kind:'thinking-lab-portable-workspace',version:1,workspace:value},null,2);
 if(new TextEncoder().encode(exported).byteLength>max)throw Error('This workspace is near its export limit. Keep this version and start a new workspace before adding more source snapshots.');
}
