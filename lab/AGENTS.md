# Thinking Lab

Seventeen active thinking experiments and seven earlier prototypes in the consolidated Tools repository. The root AGENTS.md owns the release workflow; CONSOLIDATION.md records the current migration. Use plain HTML, CSS and ES modules in `dist/`; no build step, externally fetched fonts, runtime libraries, live AI or employer data. Read the applicable route README and current code before changing a model. `dist/shared/catalog.js` is the collection map, using original idea-bank IDs M01–M12 and S01–S12.

Read `docs/ROADMAP.md` before planning improvements. Keep its scope, priorities, progress and feedback current as work proceeds. Distinguish planned, implemented and published changes; link completed work to its dated delivery evidence. Historical delivery records do not override the current roadmap.

Preserve existing routes and stored-work formats. Prefix new storage keys `thinking-lab:`. The eight latest scaffolds use `creative-kit` or `workshop-kit`; validate imports before changing work, preserve alternatives, and support Undo plus Markdown/JSON export. Shared changes affect multiple experiments: inspect their actual consumers.

Models compute outcomes from exposed, challengeable mechanisms. Use the same underlying scenario for fair comparisons and make information timing explicit. Fictional scores are not empirical predictions. Keep consequential mechanism/state tests beside the implementation, using Node’s built-in test runner. Run `npm test` when changing those mechanisms.

Matthew likes tactile interactions when moving, connecting, assigning, sequencing or steering changes the thinking. Avoid cosmetic dragging. `shared/drag.js` provides pointer dragging and vertical edge scrolling, but requires labelled keyboard/click alternatives. On wide canvases, make sideways scrolling discoverable. Retain focus through edits and dialogs.

Visual direction: extend Matthew’s personal website, using local Oswald headings, Newsreader text, warm paper/purple and charcoal/lime dark mode. Use `shared/theme.css` semantic tokens in CSS and SVG output; do not add route-specific hex colours. See `docs/DESIGN-SYSTEM.md`. Main body text at least 18px, regular labels 16px; smaller type for secondary metadata. Keep the working surface immediate. Verify real desktop (1440px) and phone (390px) journeys and representative touch/keyboard interactions without page overflow. Do not add a separate verification agent.

The consolidated routes are `/lab/<route>/`; `dist/` remains the source for the original Site. Package that compatibility deployment with the root packaging command so it receives common identity assets. Preserve the original Site audience unless Matthew explicitly changes it. Version changed entry assets/shared navigation so an already-open bench can receive updates. Verification and review findings belong in the concise delivery record for the relevant wave.

Idea ancestry uses `shared/ancestry.js`, `ancestry-ui.js` and `ancestry.css`. Freeze source wording at creation, record the reason for change in the consumer’s own fields, and keep live parent references separate from snapshots. Keep snapshots flat; do not recursively copy entire ancestor histories. New branching consumers must retain ancestry through their validators, imports and Markdown/JSON exports.
