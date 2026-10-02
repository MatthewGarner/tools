import {escapeHtml as esc} from '../shared/utils.js?v=0.15.0';
import {attachCardDrag} from '../shared/drag.js?v=0.15.0';
import {CAPABILITIES} from './definitions.js?v=0.15.0';
import {validateWorkload,moveStage} from './workload.js?v=0.15.0';
const uid=prefix=>`${prefix}-${crypto.randomUUID()}`;
const num=value=>Number.isFinite(value)?value:'';
export function workloadEditor(dialog,{onSave,onDelete}){
  let draft,existing=false,opener;
  const report=message=>{dialog.querySelector('#workload-error').textContent=message;};
  function render(focus){
    dialog.innerHTML=`<form id="workload-form"><div class="editor-heading"><div><p class="section-label">DESCRIBE THE WORK</p><h2 id="workload-editor-title">${existing?'Edit workload':'Create a workload'}</h2></div><button type="button" data-close class="button quiet" aria-label="Close workload editor">Close</button></div><p>Each capability is one specialist. Set the arrival pace, work mix and serial route; compare arrangements against exactly the same generated jobs.</p><div class="workload-fields"><label>Workload name<input required maxlength="80" data-field="name" value="${esc(draft.name)}"></label><label>Pieces of work<input required type="number" min="1" max="60" step="1" data-field="count" value="${num(draft.count)}"></label><label>Arrival window (days)<input required type="number" min="0" max="28" step="any" data-field="span" value="${num(draft.span)}"></label><label>Demand sample<input required type="number" min="1" max="999999" step="1" data-field="seed" value="${num(draft.seed)}"></label></div><p class="editor-hint">Arrivals spread from day 0 across this window; 0 means one batch. Mix weights are relative, so realised counts vary by sample. Stage effort varies ±10% around your estimate. One effort point is one nominal specialist-day.</p><div class="flow-editors">${draft.flows.map(f=>`<section class="flow-editor" data-flow="${f.id}"><div class="flow-heading"><label>Work type<input required maxlength="60" data-flow-field="label" value="${esc(f.label)}"></label><label>Short label<input required maxlength="30" data-flow-field="short" value="${esc(f.short)}"></label><label>Mix weight<input required type="number" min="0" max="100" step="any" data-flow-field="share" value="${num(f.share)}"></label><button type="button" class="button quiet" data-remove-flow="${f.id}" ${draft.flows.length===1?'disabled':''} aria-label="Remove ${esc(f.label)} work type">Remove type</button></div><ol class="stage-list">${f.stages.map((s,i)=>`<li class="route-stage" data-drag-id="${f.id}:${i}" data-drop-id="${f.id}:${i}"><button type="button" id="stage-handle-${f.id}-${i}" data-drag-handle class="stage-handle" aria-label="Drag stage ${i+1} in ${esc(f.label)}; or use Earlier and Later">⠿</button><label><span class="sr-only">Capability for stage ${i+1} in ${esc(f.label)}</span><select data-stage="${i}" data-stage-field="capability">${CAPABILITIES.map(c=>`<option value="${c.id}" ${s.capability===c.id?'selected':''}>${c.name}</option>`).join('')}</select></label><label>Effort<input required type="number" min="0.1" max="8" step="any" data-stage="${i}" data-stage-field="effort" value="${num(s.effort)}"></label><div class="stage-actions"><button type="button" class="button quiet" data-shift="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="Move stage ${i+1} earlier in ${esc(f.label)}">Earlier</button><button type="button" class="button quiet" data-shift="${i}" data-direction="1" ${i===f.stages.length-1?'disabled':''} aria-label="Move stage ${i+1} later in ${esc(f.label)}">Later</button><button type="button" class="button quiet" data-remove-stage="${i}" ${f.stages.length===1?'disabled':''} aria-label="Remove stage ${i+1} from ${esc(f.label)}">×</button></div></li>`).join('')}</ol><button type="button" class="button quiet" data-add-stage="${f.id}" ${f.stages.length>=8?'disabled':''}>Add stage</button></section>`).join('')}</div><button type="button" data-add-flow class="button quiet" ${draft.flows.length>=5?'disabled':''}>Add work type</button><p id="workload-error" class="editor-error" role="alert"></p><div class="editor-actions"><button type="submit" class="button primary">Use this workload</button>${existing?'<button type="submit" class="button quiet" data-copy>Save a copy</button><button type="button" class="button quiet" data-delete>Remove saved workload</button>':''}<button type="button" class="button quiet" data-close>Cancel</button></div></form>`;
    if(focus)dialog.querySelector(focus)?.focus({preventScroll:true});
  }
  function shift(flowId,from,to){
    const flow=draft.flows.find(f=>f.id===flowId);if(!flow||to<0||to>=flow.stages.length)return;
    // Incomplete text/number fields are valid editor drafts. Structural moves
    // preserve them; validate the whole workload only when the user saves.
    draft=moveStage(draft,flowId,from,to);render(`#stage-handle-${flowId}-${to}`);
  }
  dialog.addEventListener('input',e=>{
    const input=e.target,flow=draft.flows.find(f=>f.id===input.closest('[data-flow]')?.dataset.flow);
    if(input.dataset.field){draft[input.dataset.field]=input.dataset.field==='name'?input.value:(input.value===''?NaN:Number(input.value));}
    if(flow&&input.dataset.flowField)flow[input.dataset.flowField]=input.dataset.flowField==='share'?(input.value===''?NaN:Number(input.value)):input.value;
    if(flow&&input.dataset.stageField)flow.stages[Number(input.dataset.stage)][input.dataset.stageField]=input.dataset.stageField==='effort'?(input.value===''?NaN:Number(input.value)):input.value;
  });
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const flow=draft.flows.find(f=>f.id===b.closest('[data-flow]')?.dataset.flow);
    if(b.hasAttribute('data-close'))dialog.close();
    else if(b.hasAttribute('data-shift'))shift(flow.id,Number(b.dataset.shift),Number(b.dataset.shift)+Number(b.dataset.direction));
    else if(b.hasAttribute('data-remove-stage')){flow.stages.splice(Number(b.dataset.removeStage),1);render(`[data-flow="${flow.id}"] [data-add-stage]`);}
    else if(b.dataset.addStage){flow.stages.push({capability:'test',effort:.8});render(`[data-flow="${flow.id}"] [data-stage="${flow.stages.length-1}"]`);}
    else if(b.dataset.removeFlow){draft.flows=draft.flows.filter(f=>f.id!==b.dataset.removeFlow);render('[data-add-flow]');}
    else if(b.hasAttribute('data-add-flow')){draft.flows.push({id:uid('flow'),label:'New work type',short:'Work',share:20,stages:[{capability:'product',effort:.5}]});render(`[data-flow="${draft.flows.at(-1).id}"] input`);}
    else if(b.hasAttribute('data-delete')){onDelete(draft.id);dialog.close();}
  });
  dialog.addEventListener('submit',e=>{e.preventDefault();try{const copy=e.submitter?.hasAttribute('data-copy');const value=validateWorkload({...draft,id:copy?uid('workload'):draft.id});onSave(value);dialog.close();}catch(error){report(error.message);}});
  attachCardDrag({root:dialog,scrollContainer:dialog,ghostParent:dialog,onDrop:({itemId,dropId})=>{const [fromFlow,from]=itemId.split(':'),[toFlow,to]=dropId.split(':');if(fromFlow!==toFlow){report('Move a stage within its own work type.');return;}shift(fromFlow,Number(from),Number(to));}});
  dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
  return {open(config,isExisting){draft=structuredClone(config);existing=isExisting;opener=document.activeElement;if(!existing)draft.id=uid('workload');render();dialog.showModal();}};
}
