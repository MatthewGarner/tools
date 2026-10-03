# Article demonstrations

Every registered tool has a validated definition, a useful default article view and a current-state full-tool link. The catalogue includes classic Tools, Energy and all preserved Lab routes; archived/merged Lab tools keep their status. The website consumes the catalogue generically. Adding an article for an existing view requires no website code.

## Create an article example

Use a linked Tools feature worktree. Install the browser harness once with `npm ci --prefix dev/pw` (and `npx --prefix dev/pw playwright install chromium` if Chromium is missing). Published definitions and model dependencies are frozen; list them with `node dev/embed-catalogue.mjs inspect` or inspect `embed/catalogue.json` for view/control IDs and initial state.

```sh
node dev/create-tool-example.mjs rank ranking-close-call-v1 \
  --content /absolute/path/to/website/content \
  --title "When the ranking is a close call"
```

The command loads the released definition, validates its state including domain rules, runs its real browser view and writes:

- `content/tool-examples/ranking-close-call-v1.json`
- `content/assets/tool-examples/ranking-close-call-v1.png`

The manifest uses a root-relative image path, so the example works in nested articles. Title, summary and alt text default to the tool/view title and actual rendered description; edit them to explain the article’s argument accurately. The image captures the complete reading view, without interactive controls. PNG preserves the exact rendered fonts/layout and is suitable for no-JavaScript, print and failure fallback.

For a different state, save the tool’s canonical JSON state to a file and pass `--state /path/state.json`. Use `--version 1`, `--view ranking`, `--controls value,wobble` (or `--controls none`), `--summary`, `--alt` and `--width 900` as needed. Width is 320–1600 pixels. See the catalogue or definition for exact available controls: names are not CSS selectors. State is complete, not a partial patch. The default is the latest released version, its initial state, default view and small default control set.

The generator refuses to replace an existing manifest or image. Published examples are snapshots: changed state, model or illustration needs a new example ID. Do not edit a manifest’s state without regenerating its matching image. For new or changed DSL sources, always use the Tools generator: website builds validate portable structure and controls, while domain parsing/rendering stays with the frozen tool.

In the website article:

````markdown
```tool
example: ranking-close-call-v1
caption: Change the value weight and watch which priorities remain settled.
```
````

`mode: figure` shows the static illustration and full-tool link. Otherwise the reader chooses Explore to load an isolated iframe. Keep unfinished articles as drafts. The [website guide](https://github.com/MatthewGarner/website/blob/v5/site/TOOL-ARTICLES.md) owns frontmatter, asset handling, validation and publishing commands. Obsidian is a planning vault, not an automatic publishing source.

## Add a tool or a focused view

```sh
node dev/new-tool.mjs my-tool "My tool"
node dev/preview-embed.mjs my-tool
node dev/serve.mjs 8089
```

The scaffold creates a runnable full app, pure model/view and `embed/definitions/my-tool.js`. Both `/my-tool/` and `/embed/current/my-tool/` already use the same definition. The full-app host imports validated article state and keeps the current state in its URL. The starter is deliberately unregistered and marked `draft: true`; replace its illustrative calculation with the approved product design before release.

Follow [NEW_TOOL.md](../docs/agent/NEW_TOOL.md) for native design, navigation, PWA, numbering/family/origin registration and tests. Register the tool in the executable tool inventory, then remove the draft marker. CI derives the required embed definitions from that inventory and fails if a registered tool lacks one. A custom native app can consume the same pure modules instead of the supplied host.

The [definition contract](CONTRACT.md) describes bounded state/schema, pure optional domain validation, views, controls, actions and full-tool encoding. Add a named view by rendering an appropriate slice of that same model and declaring supported/default controls. Reuse native calculation/renderers; never import app entry points, storage, relay or PWA code. A fragment or named view must be a deliberate reading surface, not a CSS crop of an app. Use fictional deterministic example state, escape authored text and provide a meaningful text summary. Expensive projections can opt into the host’s cancellable worker and two-result cache; Cycles is the reference.

Check actual output at phone/desktop widths in both themes, keyboard access, empty/extreme inputs, current-state handoff and meaningful semantic tests. New model/view behavior requires a higher definition version after publication. Run the [release commands](RELEASE.md) to freeze model/view dependencies and required fonts. The common browser host remains patchable. Never change a frozen model to update an old article.

## Preview and verify

Serve Tools on 8089. In the website’s `site` directory:

```sh
npm run sync:tool-contract -- /absolute/path/to/tools/embed/portable
TOOL_EMBED_ORIGIN=http://127.0.0.1:8089 npm run dev -- --host 127.0.0.1 --port 4335
```

The catalogue is checked in to the website: builds need neither a Tools checkout nor a network request. Sync when new versions become available. Local Tools links stay on the local Tools origin; Energy links retain their separate origin. Production framing permits only the two Matthew Garner website origins. Local framing additionally permits localhost/127.0.0.1 ports 4321/4335; arbitrary Vercel preview article origins are intentionally unsupported.

```sh
node --test embed/tests/*.mjs dev/embed-release.test.mjs dev/new-tool.test.mjs
npm run embed:check
npm run test:browser -- --suites standard-embeds.mjs,lab-article-origin.mjs
```

The browser suite covers every released tool on desktop/light and phone/dark, independent memory-only controls, reset, current-state links, malformed inputs and unsafe output. The website’s real-article harness adds both-browser iframe integration, theme/resize messaging, fallback, no-JavaScript and print. Payload gates count actual module graphs and fonts. Embeds do not register service workers or read saved work.

Shared bridge messages use protocol version 1, exact parent window/origin checks, ready/resize and immediate error notifications. The parent owns click-to-load, its image/caption, loading timeout and retry. Fragment state is consumed when a new document loads; full-tool handoffs open a new document. Lab scaffold handoffs add separate work; model handoffs are transient and preserve existing saved experiments. Unsupported Lab handoff versions fail visibly without modifying saved data; their frozen article views remain playable. See [Lab handoff boundaries](../lab/docs/ARTICLE-EMBEDS.md).

Deploy Tools first, verify the released routes, then sync/publish the website. Follow the repository [release guide](../docs/agent/RELEASE.md) and [model release guide](RELEASE.md). If a new version fails, retain older bundles and point a new article snapshot at the prior version while repairing the new release. `/embed/v1/flow/` and its original manifests remain byte-compatible; [legacy Flow documentation](LEGACY-FLOW.md) covers that format.
