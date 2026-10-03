import {validate,optionSnapshot,attemptSourceStatus,TEST_DECISIONS} from './state.js?v=0.22.0';
import {note,noteField,optionalNoteField} from '../shared/decision-note.js?v=0.23.0';

function hypothesis(source) {
  const f=Object.fromEntries(source.fields.map(f=>[f.label,f.text]));
  const parts=[noteField('Intervention',source.title,'Untitled intervention.'),
    noteField('Change',f.change),noteField('Why it might work',f.why,'Unknown — no rationale recorded.')];
  if(f['Relationship · mechanism']!==undefined){
    parts.push(noteField('Relationship',`${f['Relationship · Cause']||'Unnamed cause'} → ${f['Relationship · Effect']||'Unnamed effect'}`),
      noteField('Causal hypothesis',f['Relationship · mechanism'],'Unknown — relationship not written.'),
      noteField('Conditions',f['Relationship · conditions'],'Unknown — conditions not recorded.'),
      noteField('Timing',f['Relationship · lag'],'Unknown — timing not recorded.'),
      noteField('Rival explanation for the relationship',f['Relationship · alternative'],'Unknown — no rival recorded.'));
  }else parts.push('**Causal hypothesis:** No relationship attached.');
  parts.push(noteField('Expected observations',f.expected,'Unknown — no expectation recorded.'),
    noteField('Competing explanation for the result',f.competing,'Unknown — no competing explanation recorded.'),
    noteField('How to distinguish explanations',f.observe,'Not planned.'),
    noteField('Smallest useful test',f.test,'Not planned.'),
    noteField('Cost or permission',f.tradeoff,'Unknown — not recorded.'),
    ...optionalNoteField('What would change my mind',f.evidence));
  return parts;
}

export function decisionNote(value) {
  const w=validate(value),chosen=w.options.find(o=>o.id===w.chosenId);
  const parts=[noteField('Question',w.problem,'Question not written.'),
    noteField('Currently chosen for a test',chosen?.title||'',chosen?'Untitled intervention.':'Unresolved — no intervention chosen.'),
    noteField('Current decision and remaining uncertainty',w.decision,'Unresolved — no decision recorded.')];
  // Dates, not array order, determine the latest test; a later recorded tie wins.
  const latest=w.attempts.reduce((found,a)=>!found||a.startedOn>=found.startedOn?a:found,null);
  if(latest){
    const originalProblem=latest.source.fields.find(f=>f.label==='Problem').text;
    parts.push(`## Latest test started · ${latest.startedOn}`,attemptSourceStatus(w,latest));
    if(originalProblem!==w.problem)parts.push(noteField('Question when this test started',originalProblem,'Not written.'));
    parts.push('### Original expectation',...hypothesis(latest.source),'### Result review',
      latest.reviewedOn?`**Reviewed:** ${latest.reviewedOn}`:'**Review:** Awaiting a result review.',
      noteField('Actual observations',latest.observations,'Unknown — no result recorded.'),
      noteField('Authored interpretation',latest.interpretation,'Unresolved — no interpretation recorded.'),
      noteField('Decision after this test',TEST_DECISIONS[latest.decision]),
      noteField('Reason for that decision',latest.reason,'Not recorded.'),
      noteField('Next check',latest.nextCheck,'Not planned.'));
  }else{
    parts.push('**Test history:** No dated test started.');
    if(chosen){
      const link=w.links.find(l=>l.id===chosen.linkId);
      parts.push('## Chosen test plan',
        `**Context:** ${chosen.review||link?.review?'Changed; review needed.':chosen.checked?'Reviewed; hypothesis remains unproven.':'Not reviewed.'}`,
        ...hypothesis(optionSnapshot(w,chosen)));
    }
  }
  return note('Intervention decision note',parts);
}
