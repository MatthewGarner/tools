import {FONT_FACES, fontFaceCSS, embedFontCSS} from './chapter-fonts.js';

const assetURL = face => new URL(`./fonts/${face.file}`, import.meta.url).href;
function base64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// The app awaits this before measuring or exporting. A failed face must not silently
// substitute a system font: that would change wrapping in the exported artifact.
export function createChapterFontLoader({fetch: fetchFile = globalThis.fetch, FontFace: Face = globalThis.FontFace,
  fonts = globalThis.document?.fonts, url = assetURL} = {}) {
  let pending;
  let embeddedCSS;
  return {
    ready: () => embeddedCSS !== undefined,
    load() {
      if (pending) return pending;
      pending = (async () => {
        if (!Face || !fonts) throw new Error('Chapter typography requires the browser Font Loading API.');
        const loaded = await Promise.all(FONT_FACES.map(async descriptor => {
          const response = await fetchFile(url(descriptor));
          if (!response.ok) throw new Error(`Cannot load Chapter font ${descriptor.file} (HTTP ${response.status}).`);
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          if (String.fromCharCode(...bytes.slice(0, 4)) !== 'wOF2') throw new Error(`Invalid Chapter font ${descriptor.file}: expected WOFF2.`);
          const face = new Face(descriptor.family, buffer, {weight: descriptor.weight, style: 'normal', unicodeRange: descriptor.unicodeRange});
          await face.load();
          return {descriptor, face, data: `data:font/woff2;base64,${base64(bytes)}`};
        }));
        for (const {face} of loaded) fonts.add(face);
        const sources = new Map(loaded.map(({descriptor, data}) => [descriptor.file, data]));
        embeddedCSS = fontFaceCSS(face => sources.get(face.file));
      })().catch(error => {
        pending = undefined; // An explicit user retry may recover a transient fetch failure.
        throw new Error(`Chapter fonts are unavailable: ${error.message}`, {cause: error});
      });
      return pending;
    },
    embed(svg) {
      if (embeddedCSS === undefined) throw new Error('Chapter fonts are not ready. Await loadChapterFonts() before export.');
      return embedFontCSS(svg, embeddedCSS);
    },
  };
}

let shared;
const loader = () => shared ||= createChapterFontLoader();
export const loadChapterFonts = () => loader().load();
export const chapterFontsReady = () => loader().ready();
export const embedChapterFonts = svg => loader().embed(svg);
