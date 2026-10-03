import test from 'node:test';
import assert from 'node:assert/strict';
import { FAVOURITE_PREFIX, favouriteKey, readFavourites, writeFavourite, applyFavouriteChanges } from '../assets/catalogue-favourites.js';

function storage() {
  const values = new Map([['other:work', 'preserve this']]);
  return { values, getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) };
}
const ids = ['product:roadmap', 'energy:cycles', 'lab:interventions'];

test('favourites retain only tool identifiers and read only known preference keys', () => {
  const store=storage();writeFavourite(store,ids[0],true);writeFavourite(store,ids[2],true);
  assert.deepEqual([...readFavourites(store,ids)], [ids[0],ids[2]]);
  assert.equal(store.values.get(favouriteKey(ids[0])),'1');assert.equal(store.values.get('other:work'),'preserve this');
  const requested=[];readFavourites({getItem:key=>{requested.push(key);return null;}},ids);
  assert.deepEqual(requested,ids.map(favouriteKey));assert.ok(requested.every(key=>key.startsWith(FAVOURITE_PREFIX)));
  writeFavourite(store,ids[0],false);assert.equal(store.values.has(favouriteKey(ids[0])),false);assert.equal(store.values.get('other:work'),'preserve this');
});

test('independent tab changes do not replace another tool’s favourites with a stale list', () => {
  const store=storage();const tabA=readFavourites(store,ids),tabB=readFavourites(store,ids);
  assert.equal(tabA.size,0);assert.equal(tabB.size,0);
  writeFavourite(store,ids[0],true);writeFavourite(store,ids[1],true);
  assert.deepEqual([...readFavourites(store,ids)],[ids[0],ids[1]]);
  writeFavourite(store,ids[0],false);writeFavourite(store,ids[2],true);
  assert.deepEqual([...readFavourites(store,ids)],[ids[1],ids[2]]);
});

test('blocked reads, quota errors and blocked removals surface without silently claiming persistence', () => {
  const blocked={getItem(){throw Error('blocked read');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked removal');}};
  assert.throws(()=>readFavourites(blocked,ids),/blocked read/);
  assert.throws(()=>writeFavourite(blocked,ids[0],true),/quota/);
  assert.throws(()=>writeFavourite(blocked,ids[0],false),/blocked removal/);
  const store=storage();const before=new Map(store.values);
  assert.throws(()=>writeFavourite(store,'../private/work',true));assert.throws(()=>writeFavourite(store,ids[0],'yes'));
  assert.deepEqual(store.values,before);
});

test('temporary choices survive another tab updating storage, without mutating either source', () => {
  const saved=new Set([ids[0]]),changes=new Map([[ids[0],false],[ids[2],true]]);
  assert.deepEqual([...applyFavouriteChanges(saved,changes)],[ids[2]]);
  const otherTab=new Set([ids[0],ids[1]]);
  assert.deepEqual([...applyFavouriteChanges(otherTab,changes)],[ids[1],ids[2]]);
  assert.deepEqual([...saved],[ids[0]]);assert.deepEqual([...otherTab],[ids[0],ids[1]]);assert.equal(changes.size,2);
  changes.delete(ids[2]);assert.deepEqual([...applyFavouriteChanges(new Set(ids),changes)],[ids[1],ids[2]]);
});
