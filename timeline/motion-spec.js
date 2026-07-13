/* timeline is fade-dominant: its content is filled diamonds (path[data-ms]),
   rounded-rect whiskers and dashed today/tick lines — almost nothing draws.
   Empty draw = the staggered fade (the on-brand default). Hold the lane cards
   (rect[rx]) so the surfaces don't slide up under the marks. */
export const REVEAL = {draw: '', hold: 'rect[rx]'};
