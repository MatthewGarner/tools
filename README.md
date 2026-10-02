# Tools Lab

Interactive tools for product work, energy and exploring uncertain situations. One repository and one searchable catalogue, with domain, interaction-type and maturity filters. Matthew’s [website identity](https://www.matthewgarner.me) ties the collection together; each tool keeps its own model and working surface.

Tools Lab lives at [tools.matthewgarner.me](https://tools.matthewgarner.me). Product retains its existing tool URLs and a collection page at `/product/`; [Energy](https://energy.matthewgarner.me) keeps its original domain. Lab uses `/lab/`, including the archived prototypes. The consolidation’s implementation and publication status is recorded in [CONSOLIDATION.md](CONSOLIDATION.md).

## Work locally

```sh
npm --prefix dev/pw ci
node dev/serve.mjs 8087
node dev/serve.mjs 8089 --origin=energy
```

The first server emulates Tools and previews; the second emulates the Energy domain. Open `/`, `/product/`, `/energy/` or `/lab/` on the first server. Plain HTML, CSS and ES modules ship without a framework build. CodeMirror is vendored; fonts are local.

After editing inventory, shared navigation or shipped assets:

```sh
npm run sync
npm run test:node
npm run gate
```

The gate runs the existing model/export tests, Lab’s mechanism tests, SVG goldens and browser journeys. Source inventories live in `dev/tool-dirs.mjs`, `lab/dist/shared/catalog.js` and `dev/suite-pages.mjs`. `dev/generate-catalogue.mjs` checks that the combined catalogue covers them; collection membership does not create a second copy of a tool.

## State and maintenance

Models can live in URLs, local drafts, named saves or Lab workspaces. `/backup/` exports this browser origin’s saved work and previews an import before changing it. Existing items are kept by default; replacement requires a pre-import recovery copy. Export on the old address first. Product and Lab work can move to Tools Lab; Energy work stays on Energy. Mixed files import the compatible items and link to the remaining destinations. Keep share links for work held only in a URL. Backup transports damaged saved values too; it does not repair them.

Tools and Energy retain their complete offline releases. Lab still requires a connection and is not silently added to either collection’s precache. Keep the original Lab address available while saved work moves. `node dev/package-lab.mjs /tmp/new-lab-release` prepares that Site from the same source, including the common identity and backup page; follow the existing Site’s audience and release settings.

The personal website owns `assets/identity`; update its pinned copy explicitly with `node dev/sync-identity.mjs --from <website>/site/src/identity`, then `npm run sync`. Shared presentation must not change author-selected artefact fonts, chart semantics or export measurements.

Release from a tested feature branch using [the release guide](docs/agent/RELEASE.md). Keep the import merge ancestry when merging the consolidation. Roll back a bad deployment to the previous verified release; never clear users’ storage to fix an asset problem. Service workers activate a new complete release after old pages close, so an already-open tool stays coherent.

[ARCHITECTURE.md](ARCHITECTURE.md) explains the model/browser boundaries, routing, persistence and relay. [DSL.md](DSL.md) documents the text-driven tools. Lab assumptions stay beside their engines. Examples are fictional; models are explanatory tools rather than calibrated operational forecasts. Gauge’s ephemeral, numbers-only relay is the sole backend exception.
