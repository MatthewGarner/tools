/* Pure SVG geometry primitives. Attribute order and rounding are part of the export contract. */
export const r2 = n => Math.round(n * 100) / 100;

export function rect(x, y, w, h, fill, o = {}){
  return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
    '" fill="' + fill + '"' +
    (o.rx != null ? ' rx="' + o.rx + '"' : '') +
    (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' : '') +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
}
export function line(x1, y1, x2, y2, stroke, w = 1, opacity = 1){
  return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) +
    '" stroke="' + stroke + '" stroke-width="' + w + '" opacity="' + opacity + '"/>';
}
