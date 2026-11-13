/* The type face of a Paths surface. The page draws in the system faces; a surface that leaves the page — Download SVG/PNG,
   Copy PNG, the receipts, Print — is drawn in the house face and carries it embedded, so it reads the same on any
   machine and its measured wraps hold. A renderer calls useFace(ctx) first; SANS and SERIF stringify to the face in force, so
   every `'600 11px ' + SANS` measures and draws in one face. The house family is named only in face-house.js (page and export harnesses), so an embed carries none. Pure, no DOM. */
const SYSTEM_SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SYSTEM_SERIF = "Charter,'Bitstream Charter',Georgia,serif";
let HOUSE = null;
let house = false;
export function registerHouseFace(family){ HOUSE = family; }

export const SANS = {toString: () => house ? HOUSE : SYSTEM_SANS};
export const SERIF = {toString: () => house ? HOUSE : SYSTEM_SERIF};
export const leavesThePage = ctx => !!ctx && ctx.intent === 'native';
export function useFace(ctx){ house = leavesThePage(ctx) && !!HOUSE; }
