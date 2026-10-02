# Thinking Lab design language

Matthew’s [personal website](https://www.matthewgarner.me) is the reference. Source inspected 2 October 2026: `website/site/src/styles/global.css` and `BaseLayout.astro`; the live site confirmed the same fonts and colours. The website repository itself is unchanged.

Oswald carries headings and prominent numbers. Newsreader carries prose, questions, inputs and controls. Monospace is reserved for compact metadata and chart axes. Fonts are served locally, with their licences in `dist/shared/fonts`. Keep the working surface immediate: editorial typography should not turn a model into a long introduction.

| Role | Light | Dark |
|---|---|---|
| Paper | `#faf8f2` | `#24212c` |
| Ink | `#24212c` | `#f4f0e6` |
| Heading | `#24212c` | `#e4ddef` |
| Muted text | `#686170` | `#bdb5c8` |
| Accent | `#594278` | `#d6ec79` |
| Surface | `#eee9f3` | `#35303e` |
| Rules | `#c9c2d1` | `#62596d` |

`dist/shared/theme.css` owns these website tokens and their extensions: warm card surfaces, sage for available/supporting states, ochre for commitments or uncertainty, rose for failures, and contrasting text on filled controls. Use the same roles in SVGs and legends. Colour alone must not identify a series or state: keep labels, outlines, dashed lines and text explanations. Never refer to a fixed accent colour in instructions; light and dark themes differ.

`dist/shared/design.css` supplies the common finish; route styles own interaction geometry. Cards resemble paper with restrained corners and thin rules. Reserve movement and layered edges for useful interaction feedback. Avoid decorative shadows, gradients and route-specific palettes. Keep useful diagrams, controls and comparisons rather than introducing imagery for its own sake.

Appearance starts from the system setting and follows the user’s saved choice across the suite. It updates CSS tokens without rerendering the model or changing saved work. Its separate key is `thinking-lab:appearance`. Load `appearance.js` in the head, shared base styles first and shared design styles after route styles.

For subsequent changes: use these tokens, retain 18px body text and 16px ordinary controls where geometry allows, and inspect real desktop and phone journeys in both appearances. Chart coordinate systems and dense canvas metadata need individual judgement. Preserve visible focus, labelled controls, reduced motion and tactile interactions with keyboard/click alternatives.
