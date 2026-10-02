import {uid,captureConcept,validateWorkspace} from './model.js?v=0.21.0';

export const VERDICTS={open:'Unexamined',try:'Possibly overlooked',reason:'Empty for a reason'};
export const axes=w=>[w.dimensions.find(d=>d.id===w.map.rowId),w.dimensions.find(d=>d.id===w.map.columnId)];
export const cell=(row,column)=>`${row}|${column}`;
export const selectedCell=w=>cell(w.map.row,w.map.column);
export const coordinates=(w,key=selectedCell(w))=>{const [row,column]=key.split('|');return[{dimensionId:w.map.rowId,optionId:row},{dimensionId:w.map.columnId,optionId:column}];};
// Canonical pairs retain one notebook entry when the axes are transposed.
export const noteKey=coords=>coords.map(c=>`${c.dimensionId}:${c.optionId}`).sort().join('|');
export const gap=(w,key=selectedCell(w))=>w.map.notes[noteKey(coordinates(w,key))]??{coordinates:coordinates(w,key),verdict:'open',reason:''};
export const labelCoordinates=(w,coords)=>coords.map(c=>{const d=w.dimensions.find(d=>d.id===c.dimensionId);return{dimension:d.name,label:d.options.find(o=>o.id===c.optionId).label};});
export const locationOf=(w,c)=>c.placement[w.map.rowId]&&c.placement[w.map.columnId]?cell(c.placement[w.map.rowId],c.placement[w.map.columnId]):'unplaced';
export const usedOption=(w,dimension,option)=>w.concepts.some(c=>c.placement[dimension]===option)||Object.values(w.map.notes).some(g=>g.coordinates.some(c=>c.dimensionId===dimension&&c.optionId===option));

export function apply(w,a){
 if(a.type==='view')w.view=a.view;
 else if(a.type==='axes'){
  if(a.row===a.column)throw Error('Choose two different dimensions.');
  const r=w.dimensions.find(d=>d.id===a.row),c=w.dimensions.find(d=>d.id===a.column);
  if(!r||!c)throw Error('A map dimension is missing.');
  w.map.rowId=r.id;w.map.columnId=c.id;w.map.row=r.selectedId;w.map.column=c.selectedId;
 }else if(a.type==='select-cell') [w.map.row,w.map.column]=a.cell.split('|');
 else if(a.type==='gap'){
  if(!['verdict','reason'].includes(a.field))throw Error('Unknown gap field.');const g=structuredClone(gap(w));g[a.field]=a.value;w.map.notes[noteKey(g.coordinates)]=g;
 }else if(a.type==='clear-gap')delete w.map.notes[noteKey(coordinates(w))];
 else if(a.type==='move'){
  const c=w.concepts.find(c=>c.id===a.id);if(!c)throw Error('Concept is missing.');
  const [row,column]=a.cell==='unplaced'?[null,null]:a.cell.split('|');
  if(c.placement[w.map.rowId]!==row||c.placement[w.map.columnId]!==column)c.fitNeedsReview=true;
  c.placement[w.map.rowId]=row;c.placement[w.map.columnId]=column;w.activeConceptId=c.id;
 }else if(a.type==='review-fit'){
  const c=w.concepts.find(c=>c.id===a.id);if(!c)throw Error('Concept is missing.');c.fitNeedsReview=false;
 }else if(a.type==='capture-gap'){
  const copy=structuredClone(w),g=gap(w),coords=coordinates(w);
  for(const x of coords)copy.dimensions.find(d=>d.id===x.dimensionId).selectedId=x.optionId;
  const c=captureConcept(copy);c.origin={kind:'gap',ingredients:labelCoordinates(w,coords),verdict:g.verdict,reason:g.reason};
  w.concepts.push(c);w.activeConceptId=c.id;
 }else if(a.type==='mix-gap'){
  for(const x of coordinates(w)){const d=w.dimensions.find(d=>d.id===x.dimensionId);d.selectedId=x.optionId;d.locked=true;}w.view='generate';
 }else if(a.type==='dimension'){
  const old=w.dimensions.find(d=>d.id===a.dimension.id);
  if(old){
   for(const o of old.options)if(!a.dimension.options.some(n=>n.id===o.id)&&usedOption(w,old.id,o.id))throw Error('This option has mapped concepts or gap notes. Move those concepts and clear the note before removing it.');
   const renamed=old.name!==a.dimension.name;
   for(const c of w.concepts)if(c.placement[old.id]&&(renamed||old.options.find(o=>o.id===c.placement[old.id])?.label!==a.dimension.options.find(o=>o.id===c.placement[old.id])?.label))c.fitNeedsReview=true;
   Object.assign(old,a.dimension);if(!old.options.some(o=>o.id===old.selectedId))old.selectedId=old.options[0]?.id;
   if(w.map.rowId===old.id&&!old.options.some(o=>o.id===w.map.row))w.map.row=old.selectedId;
   if(w.map.columnId===old.id&&!old.options.some(o=>o.id===w.map.column))w.map.column=old.selectedId;
  }else w.dimensions.push(a.dimension);
  w.history=[];
 }else if(a.type==='remove-dimension'){
  const d=w.dimensions.find(d=>d.id===a.id);if(!d)throw Error('Dimension is missing.');
  if(d.options.some(o=>usedOption(w,d.id,o.id)))throw Error('This dimension has mapped concepts or gap notes. Keep it or move those concepts and clear its notes first.');
  if(w.dimensions.length<=2)throw Error('Keep at least two dimensions.');
  w.dimensions=w.dimensions.filter(d=>d.id!==a.id);w.concepts.forEach(c=>delete c.placement[a.id]);
  if(w.map.rowId===a.id||w.map.columnId===a.id){w.map.rowId=w.dimensions[0].id;w.map.columnId=w.dimensions[1].id;w.map.row=w.dimensions[0].selectedId;w.map.column=w.dimensions[1].selectedId;}w.history=[];
 }else throw Error('Unknown map action.');
}

// Mutations validate a copy; rejected actions cannot partly change saved work.
export function transition(w,a){const next=structuredClone(w);apply(next,a);return validateWorkspace(next);}
