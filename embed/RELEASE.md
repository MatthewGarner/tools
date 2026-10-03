# Releasing article models

The [definition contract](CONTRACT.md) describes the pure model/view interface. The [website authoring guide](https://github.com/MatthewGarner/website/blob/v5/site/TOOL-ARTICLES.md) covers articles and matching illustrations. Article models are separate from the patchable iframe host.

Registration is derived from `TOOL_DIRS`, `ENERGY_TOOL_DIRS` and the complete Lab experiment catalogue, including archived and merged routes. Each registered ID needs `embed/definitions/<id>.js`, valid bounded example state and a useful default view. Unregistered scaffolds may retain `draft: true`; drafts cannot be released. No application entry, browser storage, relay or PWA module may enter a model graph.

```sh
node dev/embed-catalogue.mjs inspect       # inventory, metadata and graph budgets
node --test embed/tests/*.mjs dev/embed-release.test.mjs
node dev/embed-catalogue.mjs release      # all new versions; optionally list tool IDs
node dev/embed-catalogue.mjs check        # checked-in bytes, metadata and export parity
```

Finish native model tests and browser QA before release. A new model/view version must increment `definition.version`; the command refuses to alter or repoint any existing version. One release freezes the union of selected dependency graphs under `embed/releases/<sha256>/`, preserving repository-relative module paths and deduplicating shared modules. The manifest records the source commit, every file hash, each tool's graph hash and its metadata. Required local fonts are frozen too. Literal `?v=` cache tags remain valid; unresolved/dynamic, missing, escaping and network dependencies fail.

The initial bundle on a new feature branch may be regenerated **only while all its files are uncommitted and unpublished**, when QA identifies a fix. Remove only that known generated bundle and its generated version routes after verifying `git ls-files` lists none of them, then regenerate. This is a one-time preparation step, not an update mechanism. Once committed or published, retain it permanently and release a higher version. `/embed/v1/flow/` predates this system and remains unchanged; the standard Flow definition starts at version 2.

Each `/embed/<id>/v<n>/entry.js` imports its frozen definition and the shared `embed/runtime/mount.js` API. Compatible host/security/transport changes can ship without changing model maths. Update the portable helpers after compatible core changes with `node dev/embed-catalogue.mjs sync`; `check` rejects stale copies.

The website vendors exactly five files from `embed/portable`: `catalogue.json`, `schema.js`, `codec.js`, `definition.js`, and `legacy.js`. The catalogue is compact JSON containing every published tool version, its exact route, schema, controls, example state, full-tool encoding, model digest and frozen font paths. It imports no engines and needs no build-time network fetch. Sync it through the website's documented command; do not hand-edit it.

`npm run test:node` includes registration, release, adapter, payload and injection checks. Follow the normal repository release gate and deploy Tools before publishing articles that reference its new versions.
