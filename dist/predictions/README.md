# When predictions change behaviour · M09

Move participants between common and private signals, then inspect the feedback. Model 2 gives all estimates the same starting value, update speed and noise amplitude. Shared participants receive a common noisy observation; individual sources receive different draws. Noise is indexed by sample, round and source, so assignment edits replay identical draws. All observations arrive after the action changes the realised price.

The matched table changes sharing alone. With noise removed, the two runs are identical at any update speed. Fast feedback can destabilise either group. The chart shows the mean forecast actually used and the error metric averages each participant’s absolute error. These are fictional repeated clearing rounds without inventory, state of charge, bids or financial calibration.

Controls, assignment, inspection, baseline, Undo and exports remain local. Model 2 saves under `thinking-lab:predictions:v2`; a valid v1 save is copied with zero observation noise and its previous update setting. Its results change under corrected matched speeds. The untouched v1 save is retained and included in the new Markdown export. Baselines match the current underlying pattern and noise sample; the matched table holds every setting except sharing fixed.

Run `node --test dist/predictions/engine.test.js` for timing, bounded actions, no-impact counterfactual, noiseless sharing equivalence, matched private updates, reproducible noise, and legacy-settings preservation.
