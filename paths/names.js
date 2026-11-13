/* Lookups keyed by a name the author typed. A decision may be called "constructor" (and a
   document can name anything), so no such lookup may use a plain object: it would answer for
   Object.prototype's own properties. Build these maps with nameMap(); read an object that might
   be a plain one through own(). */

export function nameMap(entries = []){
  const out = Object.create(null);
  for(const [key, value] of entries) out[key] = value;
  return out;
}

export const hasOwn = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);

/* the value stored under `key` on the object itself, never one inherited from a prototype */
export const own = (object, key) => hasOwn(object, key) ? object[key] : undefined;

/* a copy that is still prototype-free (an object spread would hand back a plain object) */
export const cloneNames = object => Object.assign(Object.create(null), object);
