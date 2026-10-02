# Suite consolidation

Goal: one maintained repository and one **Tools Lab** catalogue, with Matthew’s website identity and stronger discovery, portability and release confidence.

## Decisions

- Start from Tools `2790ff1`; its shared website identity is already shipped. Keep the personal website separate and retain its pinned identity bundle.
- Preserve individual engines, URL models, exports, existing routes and browser storage keys. Collection membership must not create duplicate tools.
- Keep the Tools and Energy domains working. Moving origins is optional; browser-local work cannot silently move with a redirect.
- Matthew explicitly approved making everything public on 2026-10-02. Publish the consolidated source in the existing public Tools repository and keep the original Lab address working as a public compatibility site.
- Use one Tools Lab destination in the website-level navigation: Writing, Tools Lab and Now. Domain filters inside the catalogue cover Product, Energy, Teams & organisations, Systems and Ideas. Archives stay reachable but outside the default catalogue. Tool controls remain separate from global navigation.

## Milestones

| Milestone | Completion evidence | Status |
| --- | --- | --- |
| 1. Bring sources together | Lab history retained; source provenance recorded; existing Node checks integrated | Complete |
| 2. Unify discovery and identity | Searchable catalogue; common navigation; website identity on every route; direct/preview/legacy links work | Complete locally |
| 3. Protect saved work and continuity | Backup/restore, conflicts, origin boundaries, original Site package, saved URLs and offline updates exercised | Complete locally |
| 4. Verify the collection | Full gate, real migrations, desktop/phone, both themes, keyboard/touch, failure paths and exports | Passed locally |
| 5. Release and hand over | Hosted preview, branch CI, authorized publication, production checks; maintenance and recovery guide | Publishing; public access approved |

## Quality boundaries

Use fictional examples. Preserve explicit assumptions and model limitations. Avoid changing mathematical behavior while joining the suites. Shared identity must not override author-selected artefact fonts or measured export layouts. Do not preload the entire Lab as an accidental consequence of adding navigation. Old service-worker clients must keep a coherent release until they update.

## Evidence and changes of direction

- 2026-10-02: inspected current Tools/Energy routing, identity generation, release rules, offline caches, Recent work and Lab catalogue/storage. Created isolated `codex/unified-suite` from fresh remote main. The primary Tools checkout was behind; the current upstream already supplies website fonts, appearance and quiet shared headers.

- Local source milestone: imported Lab `ba8afe1` with its full ancestry and preserved the three later documentation updates. Lab's 246 existing tests pass. Root local/CI test commands now include Lab tests. Keep the merge ancestry when publishing; squashing this branch would discard the imported history from the consolidated graph.
- Discovery milestone: 40 current tools and seven earlier prototypes share a generated catalogue. Domain, interaction type and maturity are independent; overlap does not duplicate a tool. Six catalogue contracts pass, with desktop/phone and both-theme renders inspected. A native phone select overlapped its neighbour; explicit grid tracks and a hit-area regression fixed it.
- Identity milestone: Writing / Tools Lab / Now uses the pinned website bundle on all pages. Lab keeps its working geometry and chart semantics, with a one-time appearance migration. Seven real page journeys plus no-JavaScript phone navigation pass. Existing collection URLs remain available; the root is Tools Lab.
- Portability milestone: backup covers drafts, named versions, comparison snapshots, Premortem's linked library and current/legacy Lab stores. It excludes appearance and Gauge session identity. Fifteen pure contracts and real preserve/replace downloads, cross-tab conflicts and desktop/phone renders pass. The original Site package preserves its paths and storage origin.

- Migration evidence: a real Reframe workspace was exported from a freshly packaged original-origin Lab and imported into `/lab/reframe/`; the complete state and editable problem survived, and the old origin retained its copy. Appearance migrated once and resetting to system did not resurrect the legacy preference. Test setup must seed storage before opening an autosaving model, because Reframe flushes its own in-memory work on page exit.
- Release evidence: the full gate passed all 30 browser suites and all SVG goldens remained byte-identical. All 24 Lab routes passed desktop/phone, light/dark and production-CSP journeys. The custom 404 returns a genuine 404 with a route back to Tools Lab. After the later saved-work fix, all 3,168 Node tests passed, plus focused backup, all 23 Recent-work round trips and offline suites.

- Matthew’s direction, 2026-10-02: one **Tools Lab**, with subject domains inside the catalogue. Source collection is internal provenance; original collection URLs remain compatibility views. The refreshed gate passed this navigation and filter structure.
- First-gate corrections: fixed the migration fixture count after adding the legacy-page case, restored Apple installation metadata on the new catalogue and updated WebKit’s old navigation expectation. All three passed serially and in the refreshed full gate. Local server checks need sandbox network/listen access; a denied bind is a harness startup failure, not an application regression.
- Cached-page safeguard: retained a compatible shell/theme controller for original Lab HTML fetching new shared assets. A valid mutation removing only that guard makes the legacy-header assertion fail, demonstrating that the regression test detects the break.
- Saved-work correction: a production-host browser reproduction showed an Energy draft incorrectly imported on Tools, where its model redirects elsewhere. Imports now partition mixed files by destination and link to remaining work; the same regression passes. A footer route reaches Recent work on each instrument's own storage origin.
- Recovery is available offline on both installed-app origins; the Energy worker now includes the shared backup page. Real cold-offline downloads preserve the original draft bytes.
- Personal website: prepared `codex/tools-lab-navigation` at `144ddb1` in `/private/tmp/website-tools-lab-navigation`, based on current `origin/v5` (`78e8c50`). Its release build, 24 tests and six Chromium/WebKit navigation/appearance journeys pass. Release it alongside the suite; the website remains a separate repository.

## Release next

Local review: Tools Lab at `http://localhost:8127/`, retained Energy origin at `http://localhost:8129/`. Source is `/private/tmp/tools-suite-consolidation` on `codex/unified-suite`.

Publish a tested preview, open the PR, attach it to this chat, pass branch CI and merge with ancestry preserved. Confirm the deployed commit and run `node dev/prod-check.mjs`. Publish the original Lab compatibility package publicly, and the matching website navigation. Public source and site access are explicitly authorized; no further publication confirmation is needed.
