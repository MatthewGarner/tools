# Visual work

Read this for visible layout, styling, SVG, motion, or interaction changes.

Both themes and phones are first-class output. Use design tokens rather than raw
colours; validate any new palette against its real surface. Tap targets are at least
44px, text inputs at least 16px, and wide artefacts pan or re-layout rather than
shrinking below legibility. Motion respects reduced-motion.

Inspect the actual screenshots before offering a preview. For a new or substantially
changed tool, compare the desktop and phone contact sheets against a shipped sibling
with `dev/pw/bar.mjs`; exports remain based on the wide artefact. Capture goldens only
for intentional visual changes, then use the normal gate before review.
