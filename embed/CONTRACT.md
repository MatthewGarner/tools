# Embed standard: implementation contract

The tool owns its model, state and views. The application and article host consume the same pure modules. Article state is memory-only; loading a demonstration cannot load or save personal work, join a workshop room, register a worker or call a relay.

## Definition

Each tool has a small ES module under `embed/definitions/` exporting `definition`:

- `id`, integer `version`, `title`, `description`, `status` and `defaultView`.
- `stateSchema`: a portable, bounded JSON schema; `initialState`: a complete fictional example. Prefer the existing shareable model format so the full tool can receive the same state.
- `validate(state)`: optional pure domain validation after structural validation. It must reject invalid state without touching or mutating the caller's data.
- `views`: named views with title, description and a pure `render(state, context)` returning `{svg?, html?, summary}`. Reuse existing model/renderers, extracting app-owned rendering where needed. Never import an app entry point. Context supplies width, theme, colours and text measurement.
- `controls`: labelled input definitions with bounded values and a path into state. Each view declares the controls it supports; an article may expose a subset. A pure custom action can be declared for changes that cannot be represented as assigning one field.
- `fullTool`: allowlisted origin/path and declared state encoding. If native import is missing, add a validated import that opens separate work. Do not overwrite a user's saved workspace.

One registry lists definitions. Metadata generated from it is the website's catalogue; browser code imports only the selected definition. New tools must register a default view and valid example. CI checks registration, state, model isolation, outputs and an actual embed journey. The scaffold supplies both an app and an embed based on the same definition.

## Runtime and articles

The shared host owns state cloning, validation, controls, reset, theme/resize/ready messages, accessible errors and full-tool links. Controls use a declared state path or named action, never arbitrary code or CSS selectors. The parent continues to own click-to-load, static fallback, print and article captions. Multiple examples remain independent.

Article manifests carry tool, version, view, state, exposed controls, title, summary and local illustration/alt text. Existing Flow v1 manifests and URLs remain supported unchanged. The website consumes a checked-in, versioned metadata/validator export from Tools and needs no tool-specific implementation, Tools checkout or runtime fetch while building.

The example command validates inputs, creates a matching illustration from the actual view and writes the article manifest. The interactive view and image use identical state and model version. Static images remain useful without JavaScript or when loading fails.

## Release and quality

Published tool versions resolve to frozen model/view module graphs and recorded hashes, including shared model dependencies and required fonts. The browser host and portable validation helpers remain patchable for compatible fixes. Release generation refuses to replace published bytes; model/view changes require a new version. Development definitions remain editable until released. Preserve `/embed/v1/flow/` throughout.

Keep domain arithmetic in existing engines and keep the host independent of tool families. Measure payload and interaction costs; enforce per-tool budgets and avoid importing the whole catalogue, editors or app storage code. Inspect real desktop/phone output in both themes. Cover malformed/oversized state, invalid controls, empty/boundary inputs, instance isolation, hostile messages, blocked/slow loading, inaccessible dependencies, keyboard use, no JavaScript, print and handoff. Archived and merged Lab routes retain their status; they do not become newly promoted catalogue tools merely by gaining an embed.

Implementation sequence: establish Flow, Rank and Wardley; complete the shared runtime/catalogue/release machinery; migrate remaining classic/Energy and Lab tools; integrate generic website authoring; ship Tools before the website and verify production. The agreed goal includes the complete migration, not just the first three proofs.
