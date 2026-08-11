/* UI for the local-first handoff library. Kept separate from saved-items.js so
   tools that retain the established chip row do not pay for this prototype. */
export function savedSelectionAfterDelete(activeIndex, deletedIndex){
  if(activeIndex === deletedIndex) return {activeIndex: null, restoreCurrent: true};
  return {activeIndex: activeIndex !== null && activeIndex > deletedIndex ? activeIndex - 1 : activeIndex,
    restoreCurrent: false};
}

export function renderSavedDisclosure(row, list, opts){
  const {activeIndex = null, onLoad, onDelete, onSave, noun = 'artefact'} = opts;
  row.textContent = '';
  const details = document.createElement('details'); details.className = 'action-disclosure saved-disclosure';
  const summary = document.createElement('summary'); summary.className = 'chip';
  summary.textContent = activeIndex !== null && list[activeIndex] ? 'Saved · ' + list[activeIndex].name : 'Saved';
  const menu = document.createElement('div'); menu.className = 'action-menu';
  list.forEach((item, i) => {
    const line = document.createElement('div'); line.className = 'saved-menu-row';
    const open = document.createElement('button'); open.className = 'btn'; open.textContent = item.name;
    if(i === activeIndex) open.setAttribute('aria-current', 'true');
    open.addEventListener('click', () => { details.open = false; onLoad(item, i); });
    const del = document.createElement('button'); del.className = 'btn saved-menu-delete'; del.textContent = 'Delete';
    del.setAttribute('aria-label', 'Delete saved ' + noun + ' ' + item.name);
    del.addEventListener('click', () => onDelete(item, i));
    line.append(open, del); menu.appendChild(line);
  });
  const save = document.createElement('button'); save.className = 'btn'; save.textContent = 'Save current as new';
  save.addEventListener('click', () => { details.open = false; onSave(); });
  menu.appendChild(save); details.append(summary, menu); row.appendChild(details);
}
