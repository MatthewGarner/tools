import {fmtDay} from './parse.js';
import {timingFacts} from './timing.js';
import {decisionLead, leadDuration} from './lrm.js';
import {actionIcon} from '../assets/action-icons.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration = days => days % 7 === 0 ? `${days / 7} week${days === 7 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`;
const date = day => fmtDay(day, {month:false});
const finishDate = (item, end = 0) => fmtDay(end ? item.p90 : item.p50,{month:(item.rawDates || '').split(/\s*(?:\.\.|–|—)\s*/)[end]?.trim().length === 7});
const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
const group = facts => `<div class="inspector-group"><dl class="inspector-facts">${facts}</dl></div>`;
export function inspectorHTML(item, today, editing = false){
  const timing = timingFacts(item,today), approximate = /(?:^|\s)\d{4}-\d{2}(?=\s|$)/.test(item.rawDates), fixed = item.status === 'fixed', done = item.status === 'done';
  let html = `<div class="inspector-heading"><h2 id="inspecttitle">${esc(item.label)}</h2><button class="btn inspector-close" id="inspectclose" type="button" aria-label="Close milestone details">${actionIcon('close')}</button></div>`;
  if(editing) return html + `<form class="inspector-form" id="inspectform">
    <label>Name<input name="label" required value="${esc(item.label)}"></label>
    <label>Finish date or P50 .. P90<input name="dates" required value="${esc(item.rawDates)}"></label>
    <label>Actual start (optional)<input name="started" type="date" value="${esc(item.startedRaw || (Number.isInteger(item.started) ? new Date(item.started*86400000).toISOString().slice(0,10) : ''))}" ${fixed?'disabled':''}></label>
    <label>Status<select name="status"><option value="" ${!item.status?'selected':''}>Forecast</option>${['risk','done','fixed'].map(s=>`<option value="${s}" ${item.status===s?'selected':''}>${s === 'risk'?'At risk':s === 'done'?'Done':'Fixed event'}</option>`).join('')}</select></label>
    <label>Commentary<textarea name="note">${esc(item.note)}</textarea></label>
    <p id="inspecterror" class="inspector-error" role="alert" hidden></p>
    <div class="form-actions"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" id="inspectcancel">Cancel</button></div>
  </form>`;
  if(!fixed && Number.isInteger(timing.started)){
    html += group(fact('Started', date(timing.started)) + (timing.valid && Number.isInteger(timing.elapsedDays) ? fact(done ? 'Actual duration' : 'Elapsed', duration(timing.elapsedDays)) : ''));
  }
  html += group(fixed ? fact('Fixed event',finishDate(item)) : done ? fact('Actual finish',finishDate(item)) : fact('P50 finish',fmtDay(item.p50,{month:/^\d{4}-\d{2}$/.test(item.rawDates.split(/\s*\.\.\s*/)[0])})) + fact(item.single ? 'Uncertainty' : 'P90 finish',item.single ? 'Not recorded' : fmtDay(item.p90,{month:/^\d{4}-\d{2}$/.test(item.rawDates.split(/\s*\.\.\s*/)[1] || '')})));
  if(timing.valid && !done && Number.isInteger(timing.p50DurationDays)) html += group(fact('Total calendar duration',`${approximate?'Approximately ':''}${duration(timing.p50DurationDays)} at P50${item.single?'':` · ${duration(timing.p90DurationDays)} at P90`}`));
  const lead = decisionLead(item,today);
  if(lead) html += group(fact('Decide by',date(lead.day)) + fact('Preparation lead',leadDuration(lead.leadDays)) + fact('Decision window',lead.state === 'closed'?'Closed':lead.state === 'today'?'Due today':'Open'));
  if(timing.issue) html += `<p class="inspector-error">${esc(timing.issue)}</p>`;
  if(item.status === 'risk') html += '<p class="inspector-note">At risk</p>';
  if(item.note) html += `<p class="inspector-note">${esc(item.note)}</p>`;
  return html + `<button class="btn inspector-edit" id="inspectedit" type="button">${actionIcon('edit')}Edit milestone</button>`;
}
