/* The type face of a Tree surface. The page draws in the system sans; a surface that leaves the page — Download SVG/PNG,
   Copy PNG, Copy slide, Print — is drawn in the house face (DM Sans) and carries it embedded, so it reads the same on any
   machine and its measured wraps hold. renderDensity calls useFace(intent) first; SANS and SERIF stringify to the face in
   force, so every `'600 13px ' + SANS` measures and draws in one face. Pure, no DOM. */
const SYSTEM = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const SYSTEM_DISPLAY = '"Helvetica Neue",Helvetica,"Segoe UI",Roboto,sans-serif';
const HOUSE = '"DM Sans",sans-serif';
let house = false;

export const SANS = {toString: () => house ? HOUSE : SYSTEM};
export const SERIF = {toString: () => house ? HOUSE : SYSTEM_DISPLAY};
export const leavesThePage = intent => intent === 'native' || intent === 'presentation';
export function useFace(intent){ house = leavesThePage(intent); }
