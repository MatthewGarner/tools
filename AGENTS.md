# Thinking Lab

Four standalone thinking experiments. This is separate from the production tools repository.

Use plain HTML, CSS and ES modules. All deployable source lives in `dist/`; no external fonts, libraries, API calls, authentication or build step. Work in your assigned directory only. Shared files, gallery, hosting and vault notes belong to the parent agent.

Each experiment has `index.html`, `app.js`, `style.css` and a pure mechanism/state module if useful. Link `../shared/base.css` before local styles. Import `mountShell` from `../shared/shell.js` and call `mountShell({active: 'commitment'|'flexibility'|'reframe'|'mixer', label: 'MODEL 01', title: '…'})`. This inserts a small global header before page content. Shared helpers are `escapeHtml(value)`, `downloadText(filename,text,mime)`, `readStore(key,fallback)`, `writeStore(key,value)` in `../shared/utils.js`. You can use them or own equivalents. Prefix storage keys `thinking-lab:`. Pure modules use named ES exports. Node tests use built-in `node:test`, files `*.test.js` beside source, excluded from published directory later if necessary.

Visual direction: a crisp, generous working instrument. Cool pale canvas, white surfaces, navy ink, cobalt accent; teal and amber for meaningful states. System sans font, tabular numerals, strong readable hierarchy, no marketing hero wasting the first screen. Include a working example immediately. Use local CSS to give the actual interaction room. Desktop 1440px and phone 390px must work without page overflow. Inputs and controls must be keyboard accessible and have visible labels/focus. Respect reduced motion. No generic walls of equal cards.

Models compute outcomes from exposed mechanisms. Avoid scripted conclusions or claims of empirical prediction. Scaffolds accept the user's own material, preserve edits locally and export useful Markdown. All examples are fictional/generic. No employer information. Keep explanations short and near the relevant control.

Run meaningful mechanism tests, document assumptions in a concise local README, and report limitations honestly. Do not ask a second agent to review your work. Do not change shared files or register/deploy Sites. Parent handles integration, browser verification and publication.
