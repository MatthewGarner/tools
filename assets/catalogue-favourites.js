// One key per tool keeps independent changes in different tabs from overwriting
// one another. These are preferences only; no authored work or usage is recorded.
export const FAVOURITE_PREFIX = 'tools:catalogue:favourite:v1:';

export function favouriteKey(id) {
  if (typeof id !== 'string' || !/^(product|energy|lab):[a-z][a-z-]*$/.test(id)) throw new Error('Unknown catalogue tool.');
  return FAVOURITE_PREFIX + id;
}

export function readFavourites(storage, ids) {
  return new Set(ids.filter(id => storage.getItem(favouriteKey(id)) === '1'));
}

export function writeFavourite(storage, id, selected) {
  if (typeof selected !== 'boolean') throw new Error('Choose whether this tool is a favourite.');
  const key = favouriteKey(id);
  if (selected) storage.setItem(key, '1');
  else storage.removeItem(key);
}

export function applyFavouriteChanges(saved, changes) {
  const result = new Set(saved);
  for (const [id, selected] of changes) {
    if (selected) result.add(id);
    else result.delete(id);
  }
  return result;
}
