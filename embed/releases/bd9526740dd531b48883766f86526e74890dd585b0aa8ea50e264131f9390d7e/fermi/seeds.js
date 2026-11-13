/* The stream contract, in one place. A saved Fermi link stores inputs only, so these
   constants are part of what a link means: change one and every saved figure moves.
   app.js and dev/golden.mjs both import them, so a changed constant turns a golden red. */
export const SEEDS = {A: 0x5EED, B: 0x0B5EED};   // estimate variants A and B
export const N = 20000;                          // estimate runs
export const SENS_N = 8000;                      // runs behind each sensitivity pin and each solver evaluation
export const POUR_GRAINS = 500;                  // grains in "Replay the maths"
export const CF_SEED = 0xCA5F;                   // cash flow
export const CF_N = 40000;                       // cash-flow runs
export const CF_BAND_N = 10000;                  // runs behind the cumulative-cash chart (a picture, so the first 10,000 of them)
