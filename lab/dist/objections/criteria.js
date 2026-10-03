import {text,list,identifiers,choice} from '../creative-kit/state.js?v=0.21.0';

export const MAX_CRITERIA = 12;
export const CRITERION_KINDS = {constraint:'Hard constraint',preference:'Preference'};
export const JUDGEMENTS = {unknown:'Unknown',meets:'Meets',partial:'Partly meets',misses:'Does not meet'};
const clone = value => structuredClone(value);
export const criterion = id => ({id,label:'',kind:'preference',active:true});
export const assessmentFor = (design,id) => design.assessments?.find(a=>a.criterionId===id) ?? null;

export function validateCriteriaRows(owner){
  if(owner.criteriaRows===undefined)owner.criteriaRows=[];
  list(owner.criteriaRows,MAX_CRITERIA);identifiers(owner.criteriaRows);
  for(const row of owner.criteriaRows){text(row.label);choice(row.kind,Object.keys(CRITERION_KINDS));if(typeof row.active!=='boolean')throw Error('Invalid criterion visibility.');}
}
export function validateAssessments(rows,owner){
  if(owner.assessments===undefined)owner.assessments=[];
  list(owner.assessments,MAX_CRITERIA);
  const ids=new Set();
  for(const a of owner.assessments){
    if(!a||!rows.some(row=>row.id===a.criterionId)||ids.has(a.criterionId))throw Error('An assessment needs one existing criterion.');
    ids.add(a.criterionId);choice(a.judgement,Object.keys(JUDGEMENTS));text(a.reason);
    if(typeof a.needsReview!=='boolean')throw Error('Invalid assessment review state.');
    if(a.reviewed!==null){if(!a.reviewed||typeof a.reviewed!=='object')throw Error('Invalid reviewed criterion.');text(a.reviewed.label);choice(a.reviewed.kind,Object.keys(CRITERION_KINDS));}
    if(a.reviewed&&!a.needsReview&&a.judgement!=='unknown'&&!a.reason.trim())throw Error('A recorded judgement needs a supporting reason.');
  }
}
export function needsReassessment(row,a){
  return !!a && (a.needsReview || !!a.reviewed && (a.reviewed.label!==row.label || a.reviewed.kind!==row.kind));
}
export function assessmentStatus(row,a){
  return !a?.reviewed ? 'Not yet recorded' : needsReassessment(row,a) ? 'Reassessment needed' : 'Recorded judgement';
}
export function markAssessmentsForReview(design){for(const a of design.assessments??[])a.needsReview=true;}
function rowFor(w,id){const row=w.criteriaRows.find(row=>row.id===id);if(!row)throw Error('Criterion is missing.');return row;}
function designFor(w,id){const d=w.designs.find(d=>d.id===id);if(!d)throw Error('Alternative is missing.');return d;}
function editableAssessment(w,designId,criterionId){
  rowFor(w,criterionId);const d=designFor(w,designId);let a=assessmentFor(d,criterionId);
  if(!a){a={criterionId,judgement:'unknown',reason:'',reviewed:null,needsReview:false};d.assessments.push(a);}
  return a;
}
export function applyCriteria(w,action){
  if(action.type==='add-criterion'){
    if(w.criteriaRows.length>=MAX_CRITERIA)throw Error(`Keep at most ${MAX_CRITERIA} current and retired criteria.`);
    const row=criterion(action.id);identifiers([...w.criteriaRows,row]);w.criteriaRows.push(row);return;
  }
  if(action.type==='remove-criterion'){
    rowFor(w,action.id);if(w.designs.some(d=>assessmentFor(d,action.id)))throw Error('Retire this criterion to keep its assessments.');
    w.criteriaRows=w.criteriaRows.filter(row=>row.id!==action.id);return;
  }
  if(action.type==='retire-criterion'){const row=rowFor(w,action.id);row.active=!row.active;return;}
  if(action.type==='record-assessment'){
    const row=rowFor(w,action.criterionId);if(!row.label.trim())throw Error('Name this criterion before recording an assessment.');
    const a=editableAssessment(w,action.id,row.id);
    if(a.judgement!=='unknown'&&!a.reason.trim())throw Error('Add a reason for this judgement, or keep it Unknown.');
    a.reviewed={label:row.label,kind:row.kind};a.needsReview=false;return;
  }
  if(action.collection==='criterion-rows'){
    const row=rowFor(w,action.item);choice(action.field,['label','kind']);
    const value=action.field==='kind'?choice(action.value,Object.keys(CRITERION_KINDS)):text(action.value);
    if(row[action.field]!==value){row[action.field]=value;for(const d of w.designs){const a=assessmentFor(d,row.id);if(a)a.needsReview=true;}}
    return;
  }
  if(action.collection==='criterion-assessments'){
    // Item identifiers cannot contain colons; the pair is unambiguous even after imports.
    const pair=String(action.item).split(':');if(pair.length!==2)throw Error('Assessment is missing.');
    choice(action.field,['judgement','reason']);const value=action.field==='judgement'?choice(action.value,Object.keys(JUDGEMENTS)):text(action.value);
    const a=editableAssessment(w,...pair);if(a[action.field]!==value){a[action.field]=value;a.needsReview=true;}return;
  }
  throw Error('Unknown criterion action.');
}
export function snapshotCriteria(w,d){return {criteriaNote:w.criteria,criteriaRows:clone(w.criteriaRows),assessments:clone(d.assessments)};}
export function validateCriteriaSnapshot(s){
  if(s.criteriaNote===undefined)s.criteriaNote='';text(s.criteriaNote);validateCriteriaRows(s);validateAssessments(s.criteriaRows,s);
}
export function criterionSnapshotFields(s){
  const fields=[{label:'Overall comparison notes',text:s.criteriaNote??''}];
  for(const [i,row] of (s.criteriaRows??[]).entries()){
    const a=assessmentFor(s,row.id),prefix=`Criterion ${i+1}`;
    // Three flat fields per criterion keep even the fullest valid parent within
    // ancestry's 160-field limit, without truncating any 20,000-character writing.
    fields.push({label:`${prefix} · ${CRITERION_KINDS[row.kind]}${row.active?'':' · retired'}`,text:row.label},
      {label:`${prefix} · ${a?.reviewed?CRITERION_KINDS[a.reviewed.kind]+' last reviewed':'Not yet reviewed'}`,text:a?.reviewed?.label??''},
      {label:`${prefix} · ${JUDGEMENTS[a?.judgement??'unknown']} · ${assessmentStatus(row,a)}`,text:a?.reason??''});
  }
  return fields;
}
export function criteriaMarkdown(w,d){
  if(!w.criteriaRows.length)return '';
  const lines=['### Criterion assessments',''];
  for(const row of w.criteriaRows){
    const a=assessmentFor(d,row.id);lines.push(`**${row.label||'Unnamed criterion'}** · ${CRITERION_KINDS[row.kind]}${row.active?'':' · retired'}`,
      `${JUDGEMENTS[a?.judgement??'unknown']} · ${assessmentStatus(row,a)}`,a?.reason||'_Reason not written._');
    if(a?.reviewed)lines.push(`Last reviewed: ${a.reviewed.label} · ${CRITERION_KINDS[a.reviewed.kind]}`);
    lines.push('');
  }
  return lines.join('\n');
}
