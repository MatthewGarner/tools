/* Interval track-packing for a lane. Every item is a column interval [h0,h1];
   it lands in the first TRACK (sub-row) whose columns are free.

   Source-order first-fit. When every interval is width-1 this reproduces the
   historical per-cell stack EXACTLY — same-column items fall into tracks
   0..k-1 in source order, different-column items share track 0 — which is why
   adding spans cannot move an existing golden (and so cannot disturb /why,
   whose map view delegates to roadmap's renderer). Do not "improve" the order
   with a sort: a length sort re-packs siblings when a duration is edited, and
   the board would reshuffle under a dragging cursor. */
export function packLane(items){
  const tracks = [];                       // per track: the [h0,h1] intervals on it
  const at = new Array(items.length);
  const fits = (t, c) => tracks[t].every(([a, b]) => c.h1 < a || c.h0 > b);
  items.forEach((c, i) => {
    let t = 0;
    while(t < tracks.length && !fits(t, c)) t++;
    if(t === tracks.length) tracks.push([]);
    tracks[t].push([c.h0, c.h1]);
    at[i] = t;
  });
  return {at, nTracks: tracks.length};
}
