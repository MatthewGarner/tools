# Chapter fonts

Locally hosted, unmodified Google Fonts WOFF2 subsets, retrieved 2026-09-04.
No runtime request to a third party. DM Sans supplies body text and the sans-serif
heading option; Instrument Serif supplies Chapter headings.

| Files | Version | Weights | Bytes |
|---|---|---|---:|
| `dm-sans-latin.woff2`, `dm-sans-latin-ext.woff2` | Google Fonts v17 | Variable 100–1000, upright | 55,172 |
| `instrument-serif-latin.woff2`, `instrument-serif-latin-ext.woff2` | Google Fonts v5 | 400, upright | 22,868 |

Both are licensed under SIL Open Font License 1.1; retain the adjacent license
files when redistributing. Upstream: [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans)
and [Instrument Serif](https://github.com/google/fonts/tree/main/ofl/instrumentserif).

The Google Fonts CSS2 request was
`family=DM+Sans:wght@100..1000&family=Instrument+Serif&display=swap`, with a modern
Chrome user agent. Original subset URLs, in the table's file order:

- https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K6z9mXg.woff2
- https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu6-K6z9mXgjU0.woff2
- https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjnTLgNs.woff2
- https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zsTjnTLgNuZ5w.woff2

`chapter-font-loader.js` loads these faces before measurement and embeds their
bytes in SVG exports. This preserves supported Latin glyphs in browsers that
honour SVG `@font-face`. Non-Latin scripts use platform fallback; SVG consumers
that discard embedded fonts can also substitute. PNG exports rasterise the fonts
and are the portable choice for deck applications. SVG font embedding alone does
not provide editable PowerPoint font embedding.
