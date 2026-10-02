import { SUITE_CATALOG, DEFAULT_FILTERS, parseFilters, filtersToSearch, filterCatalog, toolHref } from './suite-catalog.js';

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
let filters = parseFilters(location.search);
let editingSearch = false;

for (const tool of SUITE_CATALOG) {
  const link = document.querySelector(`[data-catalog-id="${tool.id}"] a`);
  if (link) link.href = toolHref(tool, location.hostname);
}

function render() {
  const matches = filterCatalog(filters);
  const visible = new Set(matches.map(tool => tool.id));
  for (const row of rows) row.hidden = !visible.has(row.dataset.catalogId);
  // The disclosure remains useful without JS; filtering makes it one result list.
  archived.open = filters.maturity === 'archived';
  archived.hidden = filters.maturity !== 'archived';
  count.textContent = `${matches.length} ${matches.length === 1 ? 'tool' : 'tools'}`;
  empty.hidden = matches.length !== 0;
  clear.disabled = Object.keys(DEFAULT_FILTERS).every(key => !filters[key]);

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
document.querySelector('[data-empty-clear]').addEventListener('click', reset);
form.addEventListener('submit', event => { event.preventDefault(); search.blur(); });
addEventListener('popstate', () => {
  editingSearch = false;
  filters = parseFilters(location.search);
  restoreControls();
  render();
});
restoreControls();
render();
form.hidden = false;
