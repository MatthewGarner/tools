import {readFileSync} from 'node:fs';
import {posix} from 'node:path';

/* Relative ES-module imports/re-exports, lazy imports and module workers used
   by the shipped static pages. Paths are repository-relative throughout. */
export function moduleReferences(file, source){
  const refs = new Set();
  for(const match of source.matchAll(/(?:\b(?:import|export)\s+(?:[^;'"`]*?\bfrom\s*)?|\bimport\s*\(\s*)['"]([^'"]+\.js)['"]/g))
    refs.add(match[1]);
  for(const match of source.matchAll(/new\s+Worker\(\s*new\s+URL\(\s*['"]([^'"]+\.js)['"]/g))
    refs.add(match[1]);
  return [...refs].filter(ref => ref.startsWith('.') || ref.startsWith('/'))
    .map(ref => ref.startsWith('/') ? ref.slice(1) : posix.normalize(posix.join(posix.dirname(file), ref)));
}

export function moduleGraph(root, entry, seen = new Set()){
  if(seen.has(entry)) return seen;
  seen.add(entry);
  const source = readFileSync(new URL(entry, root), 'utf8');
  for(const ref of moduleReferences(entry, source)) moduleGraph(root, ref, seen);
  return seen;
}

/* URLs consumed by releases predating the shared-code move. Keep these roots
   available for their open pages; current pages must never depend on them.
   Deck's historical exports also retain text-parts for those old consumers. */
export const COMPATIBILITY_MODULES = [
  'roadmap/vendor/codemirror.js',
  'roadmap/deck-parts.js',
  'roadmap/chapter-fonts.js',
  'roadmap/chapter-font-loader.js',
  'roadmap/chapter-colors.js',
  'roadmap/export-zip.js',
  'paths/artefact-parts.js',
];
