/* The "Start your own" skeleton: a valid, warning-free frame with the content
   left to you. Kept DOM-free so dev/starter.test.mjs can parse it through the
   real parser and prove it stays clean as the DSL moves.
   Its dates are bare months counted from the day it is made, so a new user never
   starts with work that is already overdue: the first item lands next month, the
   second three to five months out, the unlaned target five to seven. */
export function starterFor(day){
  const d = new Date(day * 86400000), base = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const ym = k => { const n = base + k; return Math.floor(n / 12) + '-' + String(n % 12 + 1).padStart(2, '0'); };
  return `title: Your programme
Workstream: The first thing you ship ${ym(1)} .. ${ym(2)}
Workstream: What comes after it ${ym(3)} .. ${ym(5)}
The date everything aims at ${ym(5)} .. ${ym(7)}`;
}
/* the skeleton as seen from August 2026, for the gate that parses every starter */
export const STARTER = starterFor(Date.UTC(2026, 7, 15) / 86400000);
