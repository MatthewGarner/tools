/* The type face of a Bets surface. The page itself draws in the system sans (and system mono for figures); a surface that
   leaves the page — Download SVG/PNG, Copy PNG, the slide, Print — is drawn in the house face (DM Sans) and carries that
   face embedded, so it reads the same on any machine and its measured wraps hold. A renderer calls useFace(ctx) first;
   SANS stringifies to the face in force, so every `'600 13px ' + SANS` measures and draws in one face. Pure, no DOM. */
import {txt as svgTxt} from '../assets/svg.js';

const SYSTEM = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const HOUSE = "'DM Sans',sans-serif";
let current = SYSTEM;

export const SANS = {toString: () => current};
/* the font figures are drawn in, for measuring them */
export const MONO_FONT = {toString: () => current === HOUSE ? HOUSE : "ui-monospace,'SF Mono',Menlo,Consolas,monospace"};
export const leavesThePage = ctx => ctx && (ctx.intent === 'native' || ctx.intent === 'presentation');
export function useFace(ctx){ current = leavesThePage(ctx) ? HOUSE : SYSTEM; }
/* figures: the system mono on the page, the house face (the embedded one) in an export */
export function txt(x, y, str, size, fill, opts = {}){
  return svgTxt(x, y, str, size, fill, opts.mono && current === HOUSE ? {...opts, mono: HOUSE} : opts);
}
