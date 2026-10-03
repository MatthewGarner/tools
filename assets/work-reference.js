/* A local pointer, not a model URL. Matching content prevents a reordered or
   deleted saved list from silently opening a different item. */
export function workToken(value) {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
}
