import {escapeHtml as esc} from '../shared/utils.js?v=0.17.0';
import {HORIZON,SCENARIOS,policyAt} from './engine.js?v=0.17.0';
import {LEVERS,MECHANISMS,compareTiming,metricValue,validateStudy} from './timing.js?v=0.17.0';

const n=value=>Number(value.toFixed(1)).toLocaleString('en-GB');
const colours=['var(--muted)','var(--accent)','var(--warn)'];
const safe=value=>esc(String(value));
export function mountTiming(root,{get,onChange,onScenario,onAnchor}){
  root.innerHTML=`<div class="timing-heading"><div><p class="section-label">ONE CHANGE / TWO STARTS</p><h2>When would you intervene?</h2><p>Move the start weeks. Follow one change through the same fictional workload.</p></div><label for="timing-scenario">Situation<select id="timing-scenario">${Object.entries(SCENARIOS).map(([id,s])=>`<option value="${id}">${s.name}</option>`).join('')}</select></label></div>
  <div class="timing-workspace"><div class="timing-controls"><label for="timing-lever">Change one lever</label><select id="timing-lever">${Object.entries(LEVERS).map(([id,d])=>`<option value="${id}">${d.label}</option>`).join('')}</select><p id="lever-description"></p><div class="timing-range"><label for="timing-value"><span id="value-label"></span><output id="value-output"></output></label><input id="timing-value" type="range"></div><p id="reference-policy" class="timing-small"></p>
  <fieldset class="timing-starts"><legend>Drag the same change through time</legend><div class="timing-range course-a"><label for="timing-a">Course A starts <output id="a-output"></output></label><input id="timing-a" type="range" max="36" step="1"></div><div class="timing-range course-b"><label for="timing-b">Course B starts <output id="b-output"></output></label><input id="timing-b" type="range" max="36" step="1"></div><div class="timing-range-ends"><span id="first-start"></span><span>Week 36</span></div></fieldset><details class="reference-details"><summary id="reference-summary">About the reference</summary><p id="reference-context" class="timing-small"></p><button type="button" id="anchor-current" class="quiet-button">Use current custom course as reference</button></details><p id="timing-message" class="timing-small" role="status" aria-live="polite"></p></div>
  <div class="timing-results"><div class="timing-outcome-head"><h3>Projected week 36</h3><span>Same demand and assumptions</span></div><div class="timing-end-table" id="timing-outcomes"></div><details class="timing-extra"><summary>Other consequences</summary><div id="timing-other"></div></details><div class="timing-path-heading"><h3>Follow the mechanism</h3><button type="button" id="timing-output" class="quiet-button">Show total output</button></div><p class="timing-small">Select a step to inspect its trajectory. These are linked feedbacks; changing one lever can have several effects.</p><div id="timing-path" class="timing-path" role="group" aria-label="Causal steps"></div>
  <section class="timing-plot"><h3 id="timing-chart-title"></h3><div id="timing-legend" class="timing-legend"></div><div id="timing-chart" class="timing-chart" role="img"></div><div class="timing-range inspection"><label for="timing-inspect">Inspect week <output id="inspect-output"></output></label><input id="timing-inspect" type="range" min="1" max="36" step="1"></div><p class="timing-small">Drag across the chart or use the week slider. Dashed paths after the reference week are hypothetical continuations.</p><div id="timing-explanation" class="timing-explanation" aria-live="polite"></div></section></div></div>`;
  const $=s=>root.querySelector(s);
  let cachedKey='',courses=[],dragging=false;
  function change(patch){onChange(validateStudy({...get().study,...patch}));render();}
  $('#timing-scenario').addEventListener('change',e=>onScenario(e.target.value));
  $('#timing-lever').addEventListener('change',e=>change({lever:e.target.value,value:LEVERS[e.target.value].value,metric:'usable'}));
  $('#timing-value').addEventListener('input',e=>change({value:Number(e.target.value)}));
  for(const key of ['a','b','inspect'])$('#timing-'+key).addEventListener('input',e=>change({[key]:Number(e.target.value)}));
  $('#timing-output').addEventListener('click',()=>change({metric:'usable'}));
  $('#anchor-current').addEventListener('click',()=>{onAnchor();render();$('#timing-message').textContent='Reference copied from your custom course. Both timing variations now share that history.';});
  function inspectAt(event){const rect=$('#timing-chart').getBoundingClientRect(),left=38,right=14,width=rect.width-left-right;change({inspect:Math.max(1,Math.min(HORIZON,Math.round(1+(event.clientX-rect.x-left)/width*35)))});}
  $('#timing-chart').addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;$('#timing-chart').setPointerCapture(e.pointerId);inspectAt(e);});
  $('#timing-chart').addEventListener('pointermove',e=>{if(dragging)inspectAt(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])$('#timing-chart').addEventListener(type,()=>{dragging=false;});
  function table(fields){return `<table><thead><tr><th scope="col">Outcome</th>${courses.map(c=>`<th scope="col">${safe(c.label)}</th>`).join('')}</tr></thead><tbody>${fields.map(([label,key,multiplier=1])=>`<tr><th scope="row">${label}</th>${courses.map(c=>`<td>${n(c.state.history.at(-1)[key]*multiplier)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
  function renderChart(data){
    const {study,assumptions}=data,metric=MECHANISMS[study.metric];
    const width=Math.max(280,$('#timing-chart').clientWidth),height=220,left=38,right=14,top=24,bottom=26;
    const values=courses.flatMap(c=>c.state.history.map(r=>metricValue(r,study.metric,assumptions)));
    const maximum=Math.max(.1,...values)*1.08;
    const x=week=>left+(week-1)/35*(width-left-right),y=value=>height-bottom-value/maximum*(height-top-bottom);
    const path=rows=>rows.map((r,i)=>`${i?'L':'M'}${x(r.week).toFixed(1)},${y(metricValue(r,study.metric,assumptions)).toFixed(1)}`).join(' ');
    let svg=`<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
    if(data.scenario==='rush')svg+=`<rect x="${x(9)}" y="${top}" width="${x(16)-x(9)}" height="${height-top-bottom}" fill="var(--warn-soft)" opacity=".45"/><text x="${x(12.5)}" y="14" text-anchor="middle">surge</text>`;
    for(let t=0;t<=4;t++){const v=maximum*t/4;svg+=`<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end">${n(v)}</text>`;}
    for(const w of [1,9,18,27,36])svg+=`<text x="${x(w)}" y="${height-5}" text-anchor="middle">${w===1?'W1':w}</text>`;
    courses.forEach((c,i)=>{
      const past=c.state.history.filter(r=>r.week<=study.anchor),future=c.state.history.filter(r=>r.week>=Math.max(1,study.anchor));
      svg+=`<path d="${path(past)}" fill="none" stroke="${colours[i]}" stroke-width="2"/><path d="${path(future)}" fill="none" stroke="${colours[i]}" stroke-width="2" stroke-dasharray="${['2 4','8 3','12 3 2 3'][i]}"/>`;
    });
    for(const [key,index] of [['a',1],['b',2]])svg+=`<line x1="${x(study[key])}" x2="${x(study[key])}" y1="${top}" y2="${height-bottom}" stroke="${colours[index]}" opacity=".45"/><text x="${x(study[key])}" y="${height-bottom-4-(key==='b'?13:0)}" text-anchor="middle" fill="${colours[index]}">${key.toUpperCase()}</text>`;
    svg+=`<line x1="${x(study.inspect)}" x2="${x(study.inspect)}" y1="${top}" y2="${height-bottom}" stroke="var(--ink)"/>`;
    courses.forEach((c,i)=>svg+=`<circle cx="${x(study.inspect)}" cy="${y(metricValue(c.state.history[study.inspect-1],study.metric,assumptions))}" r="${i===0?5:3}" fill="${colours[i]}" stroke="var(--card)" stroke-width="1"/>`);
    $('#timing-chart').innerHTML=svg+'</svg>';
    $('#timing-chart').setAttribute('aria-label',`${metric.label}, ${metric.unit}. Inspecting week ${study.inspect}. ${courses.map(c=>`${c.label}: ${n(metricValue(c.state.history[study.inspect-1],study.metric,assumptions))}`).join('. ')}.`);
    $('#timing-chart-title').textContent=metric.label;
    $('#timing-legend').innerHTML=courses.map((c,i)=>`<span><i style="--course-colour:${colours[i]}" class="course-${i}"></i>${safe(c.label)}</span>`).join('');
  }
  function render(){
    const data=get(),{study,assumptions}=data,lever=LEVERS[study.lever],sc=SCENARIOS[data.scenario];
    const key=JSON.stringify([data.scenario,study.baseEvents,study.lever,study.value,study.a,study.b,assumptions]);
    if(key!==cachedKey){courses=compareTiming(sc,study,assumptions);cachedKey=key;}
    $('#timing-scenario').value=data.scenario;$('#timing-lever').value=study.lever;$('#lever-description').textContent=lever.description;
    $('#value-label').textContent=lever.label;$('#value-output').value=`${study.value}%`;
    const input=$('#timing-value');input.min=lever.min;input.max=lever.max;input.step=lever.step;input.value=study.value;input.setAttribute('aria-valuetext',`${study.value}% ${lever.label}`);
    for(const k of ['a','b','inspect']){const input=$('#timing-'+k);input.value=study[k];if(k!=='inspect')input.min=study.anchor+1;input.setAttribute('aria-valuetext',`Week ${study[k]}`);$('#'+k+'-output').value=`${study[k]}`;}
    $('#first-start').textContent=`Week ${study.anchor+1}`;
    const base=policyAt(sc,study.baseEvents,Math.max(1,study.anchor));
    $('#reference-policy').textContent=`Reference at week ${study.anchor}: ${base.commitment}% promises · ${base.quality}% quality · ${base.recovery}% recovery.`;
    $('#reference-summary').textContent=`Reference: shared through week ${study.anchor}`;
    $('#reference-context').textContent=`Shared history through week ${study.anchor}. From its start, each course holds this lever at ${study.value}%; the other two follow all ${study.baseEvents.length?study.baseEvents.length+' saved':'existing'} scheduled policies. Your custom course stays intact.`;
    $('#timing-outcomes').innerHTML=table([['Usable points','usable'],['Declined points','cumulativeDeclined']]);
    $('#timing-other').innerHTML=table([['Open promises','outstanding'],['Repair effort owed','repairWork'],['Ending fatigue / 100','fatigue',100],['Trust / 100','trust',100]]);
    const priorFocus=document.activeElement?.dataset?.mechanism;
    $('#timing-path').innerHTML=lever.chain.map((key,i)=>`${i?'<span aria-hidden="true" class="path-arrow">→</span>':''}<button type="button" data-mechanism="${key}" aria-pressed="${study.metric===key}">${MECHANISMS[key].label}</button>`).join('');
    $('#timing-path').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>change({metric:b.dataset.mechanism})));
    if(priorFocus)$('#timing-path').querySelector(`[data-mechanism="${priorFocus}"]`)?.focus({preventScroll:true});
    $('#timing-output').setAttribute('aria-pressed',study.metric==='usable');
    renderChart(data);
    const metric=MECHANISMS[study.metric];
    $('#timing-explanation').innerHTML=`<h4>Week ${study.inspect}${study.metric==='capacity'?' → '+(study.inspect+1):''} · ${study.inspect<=study.anchor?'shared history':'projected'}</h4><div class="inspection-values">${courses.map(c=>`<div><span>${safe(c.label)}</span><strong>${n(metricValue(c.state.history[study.inspect-1],study.metric,assumptions))}</strong></div>`).join('')}</div><p class="timing-small">${metric.unit}</p><p>${metric.text}${study.metric==='returned'?(study.inspect>2?` At week ${study.inspect}, these defects were created in week ${study.inspect-2}.`:' No defects return in the first two weeks.'):''}</p>`;
  }
  render();return {render,courses:()=>courses};
}
