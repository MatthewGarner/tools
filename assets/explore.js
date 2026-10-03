import { SUITE_CATALOG, DEFAULT_FILTERS, parseFilters, filtersToSearch, filterCatalog, toolHref } from './suite-catalog.js';
import { FAVOURITE_PREFIX, readFavourites, writeFavourite, applyFavouriteChanges } from './catalogue-favourites.js';

const form = document.querySelector('[data-explore-form]');
const search = form.elements.q;
const type = form.elements.type;
const maturity = form.elements.maturity;
const domain = form.elements.domain;
const rows = [...document.querySelectorAll('[data-catalog-id]')];
const count = document.querySelector('[data-result-count]');
const empty = document.querySelector('[data-empty-results]');
const clear = form.querySelector('[data-clear-filters]');
const archived = document.querySelector('[data-archive-list]');
const emptyClear = document.querySelector('[data-empty-clear]');
const favouritesOnly = document.createElement('button');
favouritesOnly.type = 'button';
favouritesOnly.className = 'explore-favourites-filter';
favouritesOnly.dataset.favouritesOnly = '';
favouritesOnly.textContent = 'Favourites only';
clear.before(favouritesOnly);
const favouriteStatus = document.createElement('p');
favouriteStatus.className = 'explore-favourite-status';
favouriteStatus.dataset.favouriteStatus = '';
favouriteStatus.setAttribute('role', 'status');
form.append(favouriteStatus);
const ids = SUITE_CATALOG.map(tool => tool.id);
const toolsById = new Map(SUITE_CATALOG.map(tool => [tool.id, tool]));
let filters = parseFilters(location.search);
let editingSearch = false;
let savedFavourites = new Set();
let favourites = new Set();
let readFailed = false;
const temporaryChanges = new Map();

function refreshFavourites() {
  try { savedFavourites = readFavourites(localStorage, ids); readFailed = false; }
  catch { readFailed = true; }
  favourites = applyFavouriteChanges(savedFavourites, temporaryChanges);
}

function showFavouriteStatus(message = '') {
  favouriteStatus.textContent = temporaryChanges.size
    ? 'Favourite changes could not be saved. They apply only in this tab.'
    : readFailed ? 'Saved favourites could not be read. They may be unavailable in this tab.'
    : message || 'Favourites stay in this browser.';
}

for (const tool of SUITE_CATALOG) {
  const link = document.querySelector(`[data-catalog-id="${tool.id}"] a`);
  if (link) link.href = toolHref(tool, location.hostname);
}
for (const row of rows) {
  const button = row.querySelector('[data-favourite-toggle]');
  if (!button) continue;
  row.classList.add('has-favourite-control');
  button.hidden = false;
  button.addEventListener('click', () => {
    const id = row.dataset.catalogId;
    const selected = !favourites.has(id);
    try {
      writeFavourite(localStorage, id, selected);
      if (selected) savedFavourites.add(id); else savedFavourites.delete(id);
      temporaryChanges.delete(id);
      refreshFavourites();
    } catch {
      temporaryChanges.set(id, selected);
      favourites = applyFavouriteChanges(savedFavourites, temporaryChanges);
    }
    render();
    showFavouriteStatus(`${selected ? 'Added' : 'Removed'} ${toolsById.get(id).title} ${selected ? 'to' : 'from'} favourites. Saved in this browser.`);
  });
}

function render() {
  const focusedRow = document.activeElement?.closest('[data-catalog-id]');
  const matches = filterCatalog(filters, SUITE_CATALOG, favourites);
  const visible = new Set(matches.map(tool => tool.id));
  for (const row of rows) {
    const id = row.dataset.catalogId;
    row.hidden = !visible.has(id);
    const button = row.querySelector('[data-favourite-toggle]');
    if (button) {
      const selected = favourites.has(id);
      const label = `${selected ? 'Remove' : 'Add'} ${toolsById.get(id).title} ${selected ? 'from' : 'to'} favourites`;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', label);
      button.title = label;
      button.firstElementChild.textContent = selected ? '★' : '☆';
    }
  }
  // The disclosure remains useful without JS; filtering makes it one result list.
  archived.open = filters.maturity === 'archived';
  archived.hidden = filters.maturity !== 'archived';
  count.textContent = `${matches.length} ${matches.length === 1 ? 'tool' : 'tools'}`;
  empty.hidden = matches.length !== 0;
  clear.disabled = Object.keys(DEFAULT_FILTERS).every(key => !filters[key]);
  favouritesOnly.setAttribute('aria-pressed', String(Boolean(filters.favourites)));
  const noFavourites = filters.favourites && favourites.size === 0;
  empty.querySelector('p').textContent = noFavourites
    ? readFailed ? 'No favourites are available in this tab.' : 'No favourites yet. Use the star beside a tool to keep it here.'
    : filters.favourites ? 'No favourites match these filters.' : 'No tools match these filters.';
  emptyClear.textContent = noFavourites ? 'Browse all tools' : 'Clear filters';
  if (focusedRow?.hidden) {
    const index = rows.indexOf(focusedRow);
    const neighbour = rows.slice(index + 1).find(row => !row.hidden) || rows.slice(0, index).reverse().find(row => !row.hidden);
    (neighbour?.querySelector('[data-favourite-toggle]') || favouritesOnly).focus({ preventScroll: true });
  }
}

function restoreControls() {
  search.value = filters.q;
  domain.value = filters.domain;
  type.value = filters.type;
  maturity.value = filters.maturity;
}

function update(next, replace = false) {
  filters = next;
  const url = `${location.pathname}${filtersToSearch(filters, location.search)}${location.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (url !== current) {
    // Filtering still works in restricted embeds where history is unavailable.
    try { history[replace ? 'replaceState' : 'pushState'](null, '', url); } catch {}
  }
  render();
}

search.addEventListener('input', () => {
  // One entry per editing session, not one Back press per letter.
  update({ ...filters, q: search.value }, editingSearch);
  editingSearch = true;
});
search.addEventListener('blur', () => { editingSearch = false; });
for (const select of [domain, type, maturity]) select.addEventListener('change', () => {
  editingSearch = false;
  update({ ...filters, [select.name]: select.value });
});
function reset() {
  editingSearch = false;
  update({ ...DEFAULT_FILTERS });
  restoreControls();
  search.focus();
}
clear.addEventListener('click', reset);
emptyClear.addEventListener('click', reset);
favouritesOnly.addEventListener('click', () => {
  editingSearch = false;
  update({ ...filters, favourites: filters.favourites ? '' : '1' });
});
form.addEventListener('submit', event => { event.preventDefault(); search.blur(); });
addEventListener('popstate', () => {
  editingSearch = false;
  filters = parseFilters(location.search);
  restoreControls();
  render();
});
addEventListener('storage', event => {
  if (event.key !== null && !event.key.startsWith(FAVOURITE_PREFIX)) return;
  try { if (event.storageArea && event.storageArea !== localStorage) return; } catch {}
  refreshFavourites();
  render();
  showFavouriteStatus('Favourites updated from another tab.');
});
refreshFavourites();
restoreControls();
render();
showFavouriteStatus();
form.hidden = false;
