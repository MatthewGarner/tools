/* Shared "saved models" chip row (extracted 2026-07-11, ~5-consumer rule):
   a localStorage-backed list plus the chip-row render that lists them, loads
   one on click, and deletes one via its × — the block roadmap/why/tree/map/
   fermi each carried near-verbatim. Each tool keeps its own storage key, its
   own "what a saved item is" shape, and its own Save-current button (the
   save click builds a tool-specific item and the "can I save right now?"
   guard differs per tool, so that part stays local). */

export function loadSaved(key){
  try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ return []; }
}
export function storeSaved(key, list){
  try{ localStorage.setItem(key, JSON.stringify(list)); }catch(e){}
}

/* Renders the "Saved:" lead + one chip per item into `row` (cleared first).
   Does NOT append a Save-current button — callers append their own after
   calling this, since what gets saved differs per tool.
   opts: onLoad(item, i), onDelete(item, i) — required.
         label(item) -> chip button text, default item.name.
         title(item) -> optional chip button tooltip.
         deleteLabel(item) -> aria-label for the × button, default 'Delete saved ' + name. */
export function renderSavedChips(row, list, opts){
  const {onLoad, onDelete, label = m => m.name, title, deleteLabel = m => 'Delete saved ' + m.name} = opts;
  row.textContent = '';
  if(list.length){
    const lead = document.createElement('span');
    lead.className = 'lead'; lead.textContent = 'Saved:';
    row.appendChild(lead);
  }
  list.forEach((m, i) => {
    const chip = document.createElement('span');
    chip.className = 'savedchip';
    const load = document.createElement('button');
    load.textContent = label(m);
    if(title) load.title = title(m);
    load.addEventListener('click', () => onLoad(m, i));
    const del = document.createElement('button');
    del.className = 'chipdel'; del.textContent = '×';
    del.setAttribute('aria-label', deleteLabel(m));
    del.addEventListener('click', () => onDelete(m, i));
    chip.append(load, del);
    row.appendChild(chip);
  });
}
