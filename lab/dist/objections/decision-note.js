import {validate} from './state.js?v=0.22.0';
import {assessmentFor,assessmentStatus,needsReassessment,CRITERION_KINDS,JUDGEMENTS} from './criteria.js?v=0.22.0';
import {note,noteField,optionalNoteField} from '../shared/decision-note.js?v=0.23.0';

export function decisionNote(value) {
  // This validator also upgrades older work. A read-only export must not mutate it.
  const w=validate(structuredClone(value)),d=w.designs.find(d=>d.id===w.selected);
  const parts=[
    noteField('Question',w.problem,'Question not written.'),
    ...optionalNoteField('Benefit worth keeping',w.benefit),
    noteField('Selected for a test',d?.title||'',d?'Untitled alternative.':'Unresolved — no alternative selected.'),
    noteField('Reason for the next move',w.decision,'Unresolved — no decision rationale recorded.')
  ];
  if(d){
    if(d.stale||d.ancestry.parked)parts.push(`**Selection status:** ${[d.stale?'Context or connections changed; review needed.':'',d.ancestry.parked?'This selected alternative is parked.':''].filter(Boolean).join(' ')}`);
    parts.push(noteField('How it works',d.mechanism,'Unknown — mechanism not written.'),
      noteField('Expected benefit',d.benefit,'Not recorded.'),
      noteField('Cost or trade-off',d.cost,'Unknown — no cost recorded.'),
      noteField('Assumptions',d.assumptions,'Unknown — no assumptions recorded.'),
      ...optionalNoteField('Boundary',d.boundary),
      ...optionalNoteField('Difference from other approaches',d.difference),
      ...optionalNoteField('Evidence or question',d.evidence),
      ...optionalNoteField('Authored assessment',d.assessment));
    for(const b of d.borrowed)parts.push(noteField(`Borrowed benefit from ${b.title||'an untitled alternative'}${b.stale?' — source changed; review needed':''}`,b.text));
  }
  const criteria=w.criteriaRows.filter(row=>row.active);
  if(w.criteria.trim()||criteria.length)parts.push('## Criteria',...optionalNoteField('Comparison notes',w.criteria));
  for(const row of criteria){
    const a=d?assessmentFor(d,row.id):null;
    parts.push(noteField(`${CRITERION_KINDS[row.kind]} · ${row.label.trim()||'Unnamed criterion'}`,`${JUDGEMENTS[a?.judgement??'unknown']} · ${assessmentStatus(row,a)}`));
    if(a)parts.push(noteField('Reason',a.reason,'Unknown — no reason recorded.'));
    if(a?.reviewed&&needsReassessment(row,a))parts.push(noteField('Previously reviewed criterion',`${a.reviewed.label} · ${CRITERION_KINDS[a.reviewed.kind]}`));
  }
  parts.push('## Next step',noteField('Smallest useful test in the working plan',w.test,'Not planned.'),noteField('What would change my mind',w.learn,'Not recorded.'));
  if(d?.test.trim()&&d.test!==w.test)parts.push(noteField('Selected alternative’s separate test draft',d.test));
  return note('Alternatives decision note',parts);
}
