/* Portable Energy artefacts carry the assumptions that generated them. The SVG
   link is an exact snapshot; raster recipients can reproduce it from the inputs. */
import {esc, txt, wrapText} from './svg.js';
export function modelLink(tool, state, base = 'https://energy.matthewgarner.me'){
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = ''; for(const byte of bytes) binary += String.fromCharCode(byte);
  return `${base}/${tool}/#${btoa(binary)}`;
}
export function withReceipt(svg, {lines, limitation, link, colors, measure}){
  if(!svg) return svg;
  const match = svg.match(/<svg[^>]*width=["']([\d.]+)["'][^>]*height=["']([\d.]+)["']/);
  const w = Number(match[1]), h = Number(match[2]);
  const C = colors, font = '13px sans-serif';
  const rows = [...lines, limitation].flatMap(line => wrapText(line, font, w - 80, measure));
  const height = Math.ceil(h + 90 + rows.length * 20);
  const url = link.split('#')[0];
  let footer = `<g data-receipt="true"><rect x="0" y="${h}" width="${w}" height="${height-h}" fill="${C.bg}"/>`;
  footer += txt(40, h + 26, 'ASSUMPTIONS · ILLUSTRATIVE MODEL', 11, C.muted, {weight:700});
  rows.forEach((line,i) => { footer += txt(40, h + 50 + i*20, line, 13, C.ink); });
  footer += `<a href="${esc(link)}">${txt(40, height - 20, `Open exact model in SVG · ${url}`, 12, C.accent)}</a></g>`;
  return svg.replace(/height=["'][\d.]+["']/, `height="${height}"`)
    .replace(/viewBox=["'][^"']+["']/, `viewBox="0 0 ${w} ${height}"`)
    .replace(/<\/svg>$/, footer + '</svg>');
}
