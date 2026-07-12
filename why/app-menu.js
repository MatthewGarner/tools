/* Pure card-menu composers for /why's edit-in-place. No DOM. */
import {ASSUMPTION_CYCLE} from './edit-targets.js';

/* model.outcomes are the roots (parse.js), each node carrying srcLine +
   children — the same "fake root" idiom edit-targets.js's childLineFor uses
   to search that array with one recursive walk. */
const findNode = (node, srcLine) =>
  node.srcLine === srcLine ? node
    : (node.children || []).reduce((hit, c) => hit || findNode(c, srcLine), null);

/* Rows for a solution card menu: the static base (Rename/Status/＋ Add
   assumption), then one submenu row per assumption (set status / remove,
   targeting the assumption's own srcLine), then Remove branch last. Pure —
   the caller resolves `model` fresh from the current source and passes the
   clicked card's srcLine. */
export function solutionMenu(model, srcLine){
  const base = [
    {label: 'Rename…', opens: 'label'},
    {label: 'Status…', opens: 'status'},
    {label: '＋ Add assumption', action: true},
  ];
  const node = model ? findNode({srcLine: -1, children: model.outcomes || []}, srcLine) : null;
  const assumps = node ? node.children.filter(c => c.kind === 'assumption') : [];
  const rows = assumps.map(a => ({
    label: '? ' + a.label + ' · ' + a.status,
    submenu: [
      ...ASSUMPTION_CYCLE.map(s => ({
        label: s, on: a.status === s,
        commit: {kind: 'astatus', line: a.srcLine, oldRaw: a.status, value: s},
      })),
      {label: 'Remove assumption', danger: true, commit: {kind: 'removeassump', line: a.srcLine}},
    ],
  }));
  return [...base, ...rows, {label: 'Remove branch', action: true, danger: true}];
}
