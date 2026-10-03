# Published Flow v1 compatibility

For the standard shared framework and all current tools, use [Article demonstrations](README.md). This page preserves the original Flow v1 authoring contract.


`/embed/v1/flow/` is the first supported adapter: **Flow v1 / waiting-time**.
It shows average waiting against weekly demand, a selected demand point, Reset,
and a full Flow link carrying current inputs. `controls: ["demand"]` enables
exploration; `controls: []` locks inputs. It uses no saved work, tracking or
service-worker registration. Embed routes are network-only, outside the PWA precache.

## Add an article example

The [website authoring guide](https://github.com/MatthewGarner/website/blob/v5/site/TOOL-ARTICLES.md)
owns article frontmatter, Obsidian publishing, Markdown syntax and local preview.
From the Tools checkout:

1. Copy the website’s `content/tool-examples/flow-queues-v1.json` to a new filename
   such as `slack-and-speed-v1.json`. Keep `tool: "flow"`, `version: 1` and
   `view: "waiting-time"`; change `params`, `controls`, title and local image path.
2. Generate a matching static fallback directly from that manifest:

   ```sh
   node dev/generate-embed-poster.mjs \
     --example /path/to/website/content/tool-examples/slack-and-speed-v1.json \
     --output /path/to/website/content/images/demonstrations/slack-and-speed-v1.svg
   ```

   Both paths are filesystem paths; the manifest’s `image` is the website path
   `/images/demonstrations/slack-and-speed-v1.svg`. The output directory must exist.
   Copy the printed suggested `alt` and `summary` into the manifest; edit the
   summary for the article’s argument while keeping the model facts accurate.
   The generator rejects unsupported tools/views and invalid settings before
   touching output. It handles unstable queues without inventing a waiting estimate.
   Without arguments it regenerates the shipped default `v1/flow/poster.svg`.
3. Run `npm run check:tool-examples` from the website’s `site` directory, then
   insert the named example between paragraphs in the article:

   ````markdown
   ```tool
   example: slack-and-speed-v1
   caption: Increase demand while capacity stays fixed. What happens to waiting?
   ```
   ````

   Omit `caption` to use the manifest summary. Add `mode: figure` for only the
   image and link. Obsidian shows source; the website renders the demonstration.
4. Preview the actual article on desktop and phone in both themes. Exercise
   Explore, demand, Reset, full-tool handoff and print; check fallback alt/caption
   against the model. The full tool may evolve, but the article’s model stays pinned.

For a new example, regenerate its image whenever its inputs change. Do not reuse
the default poster for different parameters. Keep a published example ID, its
manifest and image stable; create a new ID/image when revising an article’s example.
The embed `version` selects a computation contract, not an article revision.

## URL and input contract

The URL fragment is `encodeURIComponent(JSON.stringify(state))`:

```json
{"params":{"demandPerWeek":8,"itemDays":2,"team":4,"wipLimit":4,"cov":"med"},"seed":61709,"controls":["demand"]}
```

Omitted fields in a direct embed use these defaults; website manifests should
state them explicitly. Unknown fields, invalid JSON and unsupported values produce
a visible error. Demand is 0.5–10 in half steps, item size 1–15 whole working days,
team 1–10 people, WIP 1–20 or 40 (full Flow’s “no limit” setting), and variability
`low`, `med` or `high`. Seed must be 61709: full Flow cannot accept a queue seed,
so permitting others would make the handoff misleading. At or above effective
capacity there is no stable wait estimate. Full Flow receives current inputs
through its existing hash codec, including the WIP-40 → slider-21 mapping.

`v1/flow/model/provenance.json` records source commit and SHA-256 hashes for the
frozen engine and its series dependency. Keep released computation immutable;
publish changed model behaviour under a new version. `--write` below restores
recorded bytes, never copies current Flow into an old article version.

```sh
node dev/freeze-embed-flow.mjs --check
node --test embed/tests/*.mjs dev/headers.test.mjs dev/origins.test.mjs dev/weight.test.mjs
npm run test:changed
```

Use `npm run sync` after changing shipped shared assets, and follow the
[release guide](../docs/agent/RELEASE.md) for preview, PR CI and publication.
Deploy the Tools route before publishing a website article that references it.

## Framing and local preview

Start Tools with `node dev/serve.mjs 8087`. In the website’s `site` directory, use
`TOOL_EMBED_ORIGIN=http://127.0.0.1:8087 npm run dev -- --host 127.0.0.1 --port 4321`.
The website override is local draft development only; published builds use Tools
production. Production framing permits only `https://www.matthewgarner.me` and
`https://matthewgarner.me`; arbitrary Vercel preview article origins are deliberately
blocked. The local Tools server additionally permits localhost/127.0.0.1 article
ports 4321 and 4335. Use the paired local preview for integration, or the approved
website production origin; do not widen the production policy to preview wildcards.

The parent passes `?parent=` containing its exact origin; otherwise the child uses
an allowed `document.referrer`. The explicit parameter is required when the parent
uses `referrerpolicy="no-referrer"`. Messages are:

- Child → parent: `{type:"mg-tool:ready",version:1}` after mounting, then
  `{type:"mg-tool:resize",version:1,height:523}` when content height changes.
- Parent → child: `{type:"mg-tool:theme",version:1,theme:"light"}` or `"dark"`.
  The child checks sender window and exact origin. Theme stays in memory.

Mutually exclusive CSP rules allow only `/embed/` routes to be framed; normal pages
retain `frame-ancestors 'none'`. The parent supplies a title, static figure/caption,
full-tool fallback and lazy user-initiated loading. Its sandbox needs scripts,
same-origin (ES modules), popups and popups-to-escape-sandbox (full-tool handoff).
The fallback covers failed loading, no JavaScript and print; the website currently
publishes RSS descriptions and links, not full article bodies.

