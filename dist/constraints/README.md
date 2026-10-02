# Constraint playground

Move a recorded constraint into remove, reverse, or exaggerate. Each move keeps separate notes. Restore the card to the real board before writing a feasible adaptation and test. Constraint types change the transfer prompt; they do not establish permission or feasibility. Examples are fictional.

Drag the labelled handle with a pointer, or use its button/the Move button with keyboard. Selecting a card opens its editable notebook. New examples and imports add workspaces. Local saving uses `thinking-lab:constraints:v1`; up to 40 grouped edits can be undone in the current tab. Markdown exports all written experiments; JSON preserves the editable workspace. Another tab pauses saving; malformed saved data can be downloaded before replacement.

Limits: no collaboration or external verification. Twelve constraints per workspace, 100 workspaces, 20,000 characters per field, 16 MB JSON imports. Export before clearing browser data. Run `node --test dist/constraints/state.test.js` from the project root. Parent handles browser integration and pointer/touch verification.
