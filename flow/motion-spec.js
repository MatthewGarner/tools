/* flow's hero — the wait-time-vs-utilisation curve that shoots up near 100% —
   is a solid undashed <polyline stroke-width="2">; the axis/frame polylines
   carry no stroke-width, so polyline[stroke-width] targets the curve(s) and
   skips the frame. Dashed reference lines fade. Hold the card surfaces. */
export const REVEAL = {draw: 'polyline[stroke-width]', hold: 'rect[rx]'};
