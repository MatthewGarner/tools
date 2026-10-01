# Possibility mixer

Edit a question and a set of dimensions. Select or lock ingredients, mix the rest, then capture a combination and develop its mechanism, usefulness, assumption and smallest experiment. Three example spaces and a blank workspace are included. Every workspace autosaves locally; Markdown exports the thinking, JSON round-trips the editable state.

Mixing samples each unlocked dimension uniformly and tries to avoid recently seen combinations. It falls back to a valid different combination when repeated randomness cannot find one. This is a provocation generator; it does not score ideas or assess feasibility. Counts describe the combinatorial space, not the number of sensible concepts. Captured ingredients are snapshots, so later changes to dimensions cannot rewrite developed ideas.

Undo covers structural actions in the current visit, not every keystroke. Local storage belongs to the current browser and origin; export a backup to move devices or keep durable work. Imported content is bounded and rendered as text. Unreadable storage is preserved for recovery; changes in another tab pause saving until the user chooses which version to keep. No server or live AI.

Run: `node --test dist/mixer/model.test.js` from the project root.
