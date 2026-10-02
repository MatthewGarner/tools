# Analogy workshop

Match target roles to source functions, check whether their relationships hold, and turn useful mechanisms and mismatches into a bounded test. Sources include simplified library reservations, triage, rehearsal, ecological succession, and a custom mechanism. Targets are fictional; mappings are hypotheses.

Drag a target card’s handle or use Match with keyboard. Moving a card replaces its pairing and returns any displaced target to the bank. Changed mappings/functions invalidate dependent judgments while retaining earlier notes. Removing roles also removes dependent edges and mappings; Undo restores them. Source and target roles, relationships, and the mechanism are editable.

New examples, new targets, source changes, and imports preserve previous workspaces. JSON remaps every graph id when importing; Markdown includes unmapped roles, judgments and the plan. Local saving uses `thinking-lab:analogy:v1`; 40 grouped edit checkpoints last for the current tab. Another tab pauses saving; malformed saved data can be exported for recovery.

Limits: six roles per side, ten relationships, 100 workspaces, 20,000 characters per field, 7 MB import. Pairings are one-to-one by design; a combined function can be represented as a named composite role. No automated claims of equivalence, prediction, cloud sync, or external verification. Export before clearing browser data. Run `node --test dist/analogy/state.test.js` from the project root. Parent handles browser and touch verification.
