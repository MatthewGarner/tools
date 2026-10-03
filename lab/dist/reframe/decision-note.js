import {normalizeSession,LENSES} from './state.js?v=0.22.0';
import {note,noteField,optionalNoteField} from '../shared/decision-note.js?v=0.23.0';

export function decisionNote(value) {
  const s=normalizeSession(value),p=s.plan,selected=s.frames.filter(f=>s.selected.includes(f.id));
  const parts=[
    noteField('Starting question',s.problem,'Question not written.'),
    ...optionalNoteField('Context',s.context),
    noteField('Working interpretation',p.statement,'Unresolved — no working interpretation written.'),
    noteField('Next move',p.nextMove,'Unresolved — no next move written.'),
    noteField('Assumption to test',p.assumption,'Unknown — no assumption recorded.'),
    noteField('Smallest useful test',p.test,'Not planned.'),
    noteField('What would change my mind',p.learn,'Not recorded.')
  ];
  if(selected.length){
    parts.push('## Selected source frames','The working interpretation above is an independent draft.');
    for(const f of selected)parts.push(
      `### ${LENSES[f.lens].name}`,
      noteField('Interpretation',f.statement,'Not written.'),
      ...optionalNoteField('Who and when',f.whoWhen),
      noteField('Assumes',f.assumption,'Unknown — no assumption recorded.'),
      noteField('Brings into view',f.reveals,'Not recorded.'),
      noteField('Leaves out',f.hides,'Unknown — no limits recorded.'),
      ...optionalNoteField('Reason for this branch',f.branchReason)
    );
  }else parts.push('**Source frames:** None selected.');
  return note('Reframing decision note',parts);
}
