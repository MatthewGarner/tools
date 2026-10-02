# Suite consolidation

Goal: one maintained repository and a coherent collection of Product, Energy and Lab tools, with Matthew’s website identity and stronger discovery, portability and release confidence.

## Decisions

- Start from Tools `2790ff1`; its shared website identity is already shipped. Keep the personal website separate and retain its pinned identity bundle.
- Preserve individual engines, URL models, exports, existing routes and browser storage keys. Collection membership must not create duplicate tools.
- Keep the Tools and Energy domains working. Moving origins is optional; browser-local work cannot silently move with a redirect.
- Lab is owner-private today; Tools’ GitHub repository is public. Public source/site publication awaits Matthew’s explicit choice. Local preparation can proceed.
- Keep navigation quiet: Explore, Product, Energy and Lab. Archives stay reachable but outside the default catalogue. Tool controls remain separate from global navigation.

## Milestones

| Milestone | Completion evidence | Status |
| --- | --- | --- |
| 1. Bring sources together | Lab history retained; source provenance recorded; existing Node checks integrated; private publication boundary resolved | In progress |
| 2. Unify discovery and identity | Searchable, filterable catalogue; shared static navigation; website identity on every route; direct/preview/legacy links work | Implemented; integration testing |
| 3. Protect saved work and continuity | Portable backup/restore with validation and conflict handling; original origin remains usable; URL state, downloads, local persistence and offline updates exercised | Implemented; browser testing |
| 4. Verify the collection | Full gate plus Lab journeys; desktop/phone and both themes inspected; keyboard/touch, empty/error/storage states and actual exports tested | Planned |
| 5. Release and hand over | Tested preview, passing branch CI, authorized publication, production checks; concise maintenance guide and recovery procedure | Planned |

## Quality boundaries

Use fictional examples. Preserve explicit assumptions and model limitations. Avoid changing mathematical behavior while joining the suites. Shared identity must not override author-selected artefact fonts or measured export layouts. Do not preload the entire Lab as an accidental consequence of adding navigation. Old service-worker clients must keep a coherent release until they update.

## Evidence and changes of direction

- 2026-10-02: inspected current Tools/Energy routing, identity generation, release rules, offline caches, Recent work and Lab catalogue/storage. Created isolated `codex/unified-suite` from fresh remote main. The primary Tools checkout was behind; the current upstream already supplies website fonts, appearance and quiet shared headers.

- Local source milestone: imported Lab `ba8afe1` with its full ancestry and preserved the three later documentation updates. Lab's 246 existing tests pass. Root local/CI test commands now include Lab tests. Keep the merge ancestry when publishing; squashing this branch would discard the imported history from the consolidated graph.
- Discovery milestone: 40 current tools and seven earlier prototypes now share a generated catalogue. Collection, interaction type and maturity are independent; Energy/Lab overlap does not duplicate a tool. Six catalogue contracts pass, with desktop/phone and both-theme browser journeys inspected. A native phone select overlapped its neighbour; explicit grid tracks and a hit-area regression fixed it.
- Identity milestone: common Explore/Product/Energy/Lab mastheads use the pinned website bundle on all pages. Lab retains its working geometry and chart semantics, with a one-time appearance preference migration. Seven real page journeys plus no-JavaScript phone navigation pass. Existing Product catalogue remains at `/product/`; the root becomes Explore.
- Portability milestone: backup covers named versions, drafts, comparison snapshots, Premortem's linked library and Lab's current/legacy stores. It excludes appearance and Gauge session identity. Fourteen pure contracts pass. Real downloads, preserve/replace imports, cross-tab conflict handling and inspected desktop/phone renders pass. The old Site packaging command keeps its paths and storage origin usable.

- Migration evidence: a real Reframe workspace was exported from a freshly packaged original-origin Lab and imported into `/lab/reframe/`; the complete state and editable problem survived, and the old origin retained its copy. Appearance migrated once and resetting to system did not resurrect the legacy preference. Test setup must seed storage before opening an autosaving model, because Reframe flushes its own in-memory work on page exit.
- Release gate in progress: all 3,167 Node tests pass and every committed SVG golden is byte-identical. The complete browser chain is running. Shared identity and all 24 Lab routes passed desktop/phone, light/dark and production-CSP checks. The custom 404 returns a genuine 404 with a route back to Explore.
