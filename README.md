# Thinking Lab

Twenty-four standalone prototypes for Matthew: twelve playable models and twelve thinking scaffolds. The catalogue follows the original idea-bank IDs M01–M12 and S01–S12, with filters for models, scaffolds and the fifteen newest additions. Source is separate from the existing tools repository.

Run `npm run serve` and open `http://127.0.0.1:4173/`. All deployable source lives in `dist/`; there is no build step or runtime dependency. Run `npm test` for mechanism and state tests. Each experiment has a short README explaining its assumptions.

Scaffolds accept custom material, retain alternatives, save locally and export Markdown plus editable JSON. Model exports capture settings and results. Browser storage belongs to an origin: local previews and the hosted site have separate saves. The application needs no accounts, live AI, proprietary data or API keys. Hosting remains owner-private.

The models are explanatory prototypes, not operational forecasts. Judge them by whether the interaction exposes a useful question and whether changing assumptions changes the apparent lesson.

Delivery records: `docs/DELIVERY.md` (first four), `docs/WAVE-2.md` (five tactile additions), and `docs/WAVE-3.md` (remaining fifteen). The current suite passes 125 tests.
