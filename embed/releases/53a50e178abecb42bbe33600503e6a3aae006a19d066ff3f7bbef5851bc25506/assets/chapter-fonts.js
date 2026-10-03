// Canonical names are DSL values. Family names deliberately match the embedded fonts.
export const TYPOGRAPHIES = Object.freeze({
  Chapter: Object.freeze({body: 'DM Sans', display: 'Instrument Serif', displayWeight: 400}),
  'DM Sans': Object.freeze({body: 'DM Sans', display: 'DM Sans', displayWeight: 700}),
});

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
export const FONT_FACES = Object.freeze([
  {family: 'DM Sans', weight: '100 1000', file: 'dm-sans-latin-ext.woff2', unicodeRange: LATIN_EXT},
  {family: 'DM Sans', weight: '100 1000', file: 'dm-sans-latin.woff2', unicodeRange: LATIN},
  {family: 'Instrument Serif', weight: '400', file: 'instrument-serif-latin-ext.woff2', unicodeRange: LATIN_EXT},
  {family: 'Instrument Serif', weight: '400', file: 'instrument-serif-latin.woff2', unicodeRange: LATIN},
].map(Object.freeze));

export function resolveTypography(model = {}) {
  return Object.hasOwn(TYPOGRAPHIES, model.font) ? TYPOGRAPHIES[model.font] : TYPOGRAPHIES.Chapter;
}

// source(face) returns a local URL for live SVG, or a data URL for portable SVG.
export function fontFaceCSS(source = face => `./fonts/${face.file}`) {
  return FONT_FACES.map(face => `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};font-display:block;src:url('${source(face)}') format('woff2');unicode-range:${face.unicodeRange};}`).join('\n');
}

// Inline previews use already-loaded local FontFace objects. Detached SVGs embed data URLs.
export function stripEmbeddedFonts(svg) {
  return svg.replace(/<style\b[^>]*data-chapter-fonts="embedded"[^>]*>[\s\S]*?<\/style>/g, '');
}

export function embedFontCSS(svg, css) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/.test(svg)) throw new Error('Cannot embed Chapter fonts: expected an SVG document.');
  // Idempotence matters when a slide preview is subsequently downloaded.
  const clean = stripEmbeddedFonts(svg);
  return clean.replace(/(<svg\b[^>]*>)/, `$1<style data-chapter-fonts="embedded"><![CDATA[${css}]]></style>`);
}
