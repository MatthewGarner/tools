/* Last-responsible-moment helpers. A decision lead is deliberately attached to
   a fixed external event: Timeline can derive a safe decision date without
   pretending it has modelled a dependency graph or a decision outcome. */
import {fmtDay} from './parse.js';
import {duration} from './duration.js';

export const isDecisionLead = it => it?.status === 'fixed' &&
  Number.isInteger(it.leadDays) && it.leadDays > 0;

export function leadDuration(days){
  return days % 7 === 0
    ? (days / 7) + ' week' + (days === 7 ? '' : 's')
    : days + ' day' + (days === 1 ? '' : 's');
}

/* A clock exists only while its EVENT is today or ahead: a decision clock for an event
   that has already happened is not a deadline, so it never leads a verdict or a receipt. */
export function decisionLead(it, today = null){
  if(!isDecisionLead(it)) return null;
  if(today != null && it.p50 < today) return null;
  const day = it.p50 - it.leadDays;
  return {it, day, eventDay: it.p50, leadDays: it.leadDays,
    state: today == null ? null : day < today ? 'closed' : day === today ? 'today' : 'open',
    daysFromToday: today == null ? null : day - today};
}

export function leadSubline(it){
  const l = decisionLead(it);
  return l ? 'DECIDE BY ' + fmtDay(l.day) + ' · ' + leadDuration(l.leadDays) + ' lead' : '';
}

export function leadReceipt(it, today = null){
  const l = decisionLead(it, today);
  if(!l) return null;
  const core = 'Decide by ' + fmtDay(l.day) + ' for ' + it.label +
    ' (' + leadDuration(l.leadDays) + ' lead).';
  if(l.state === 'closed'){
    return {l, text: 'Decision window closed: ' + core + ' It closed ' + duration(Math.abs(l.daysFromToday)) + ' ago.'};
  }
  if(l.state === 'today') return {l, text: 'Decision clock: ' + core + ' It is due today.'};
  return {l, text: 'Decision clock: ' + core};
}

/* Clock selection is purely a receipt/readout ordering rule. Every lead still
   renders on its own milestone. A closed window outranks an open one; among
   closed clocks the most recently closed is the immediately actionable one. */
export function primaryDecisionLead(model, today){
  const clocks = (model?.items || []).map(it => decisionLead(it, today)).filter(Boolean);
  const closed = clocks.filter(l => l.state === 'closed').sort((a,b) => b.day - a.day);
  return closed[0] || clocks.filter(l => l.state === 'today').sort((a,b) => a.day-b.day)[0] ||
    clocks.filter(l => l.state === 'open').sort((a,b) => a.day-b.day)[0] || null;
}
