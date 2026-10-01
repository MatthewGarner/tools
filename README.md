# Thinking Lab

Four standalone prototypes for Matthew: a team feedback model, a BESS optionality game, a reframing workbench and an editable possibility mixer. The source is separate from the existing tools repository.

Run `npm run serve` and open `http://127.0.0.1:4173/`. All deployable source is in `dist/`, with no build step or dependencies. Run `npm test` for mechanism and state tests. Each experiment has a short README explaining its assumptions.

The brainstorming tools store work locally and export Markdown/JSON. Browser storage is tied to an origin; local previews and the hosted site have separate saves. No accounts, live AI, proprietary data or API keys are used by the application. Hosting access is owner-private.

The models are explanatory prototypes, not forecasts or operational decision systems. Their usefulness should be judged by whether the interaction surfaces an interesting question and whether changing an assumption changes the apparent lesson.

Browser verification and delivery findings are recorded in `docs/DELIVERY.md` when complete.
