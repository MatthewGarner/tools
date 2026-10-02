# Analogy workshop

Match target roles to source functions, describe the target interaction in its own terms, and check the relationship. Record the enabling condition and where it would fail. Sources include simplified library reservations, triage, rehearsal, ecological succession and custom mechanisms. Targets are fictional; mappings are hypotheses.

Drag target handles or use Match with keyboard. Moving a card replaces its pairing and frees a displaced target. Changed mappings, functions, target interactions, target context or source principle invalidate affected judgements while retaining writing. Source and target roles, relationships and the mechanism remain editable; Undo restores removed parts.

Capture the draft as one of up to 16 practical adaptations. Each freezes its complete source analysis, including unmatched roles, mapping reasons, conditions and failures. For each relationship, decide whether to keep, redesign or leave it out, and explain the actual interaction and why. Compare up to four options, retain a chosen test and decision, branch variations, and park ancestors without deleting history.

Trying another source creates a new workspace with the same target and independent copies of saved adaptations. The original mapping and draft remain in the previous workspace. Thus library and triage ideas can be compared together. An adaptation based on another analysis is labelled; trying the current mapping creates a new branch with undecided responses, never silently reusing earlier verdicts.

Storage remains `thinking-lab:analogy:v1`. Legacy graphs and drafts open unchanged with empty new fields. Forty grouped Undo checkpoints last for the tab. JSON imports add a workspace and remap live graph/ancestry identifiers; frozen relationship identities belong to their captured analysis. Markdown/JSON include all alternatives, source records, responses and decisions. Another tab pauses saving; malformed saves can be downloaded for recovery.

Limits: six roles per side, ten relationships, 16 adaptations, 100 workspaces, 20,000 characters per field and 7 MB JSON imports. Flat snapshots preserve full-length fields; an export-size guard rejects oversized branches before mutation. Pairings are one-to-one; a composite role can represent a combined function. No external verification or services.

Run `node --test dist/analogy/*.test.js`. Tests cover original mappings, legacy records, context invalidation, independent alternatives, source changes, branches, recasting, long text, rejected imports, export limits and Undo. Desktop/phone journeys exercise actual pointer/touch matching, keyboard focus, comparison panning, persistence and downloads.
