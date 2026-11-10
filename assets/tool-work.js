/* Your work in {tool}: saved copies, templates, baselines. Loaded on first use by
   tool-shell.js. Title and Close stay pinned; the body scrolls; focus never falls
   to <body> while the dialog is open. */
import {scope, tool, el, button, store, failure} from './recent-ui.js';
import {readNativeWork} from './work-store.js';
import {decorateWork, workId, itemId, saveTrackedWork} from './work-metadata.js';
import {mountWorkActions} from './work-actions.js';
import {RECENT_TOOLS, recentRoute} from './recent-store.js';
import {templateStore} from './template-store.js';
import {SOURCE_TOOLS} from './saved-work-keys.js';
import {encodeHash} from './series.js';

const when = r => r.savedAt ? new Date(r.savedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}) : 'Date unavailable';

export function openWork({name, caps, opener, status, section: wanted}){
  const dialog = el('dialog', null, 'recent-dialog tool-work'), head = el('div', null, 'tool-work-head'), heading = el('h2', 'Your work in ' + name);
  const close = button('Close'), body = el('div', null, 'tool-work-body'), alert = el('p', null, 'recent-note');
  heading.id = 'tool-work-title'; dialog.setAttribute('aria-labelledby', heading.id); alert.setAttribute('role', 'status');
  head.append(heading, close); dialog.append(head, body); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if(e.target === dialog) dialog.close(); });
  /* work-actions' popover swallows Escape even when closed; only an open popover should */
  dialog.addEventListener('keydown', e => { const m = e.target.closest?.('.recent-manage'); if(e.key === 'Escape' && m && !m.open) e.stopPropagation(); }, true);
  dialog.addEventListener('close', () => { watch.disconnect(); document.removeEventListener('close', afterNested, true); dialog.remove(); opener.focus(); });
  /* failures from template starts and saves land on the page's status line; mirror them here */
  const watch = new MutationObserver(() => { if(status.textContent) alert.textContent = status.textContent; });
  watch.observe(status, {childList: true, characterData: true, subtree: true});

  /* ---- focus: remember where it was, put it back after every repaint ---- */
  let memo = null;
  const key = t => {
    const li = t.closest('li[data-rid]'), sec = t.closest('section[data-sec]');
    if(!li || !sec) return null;
    return {sec: sec.dataset.sec, rid: li.dataset.rid, at: [...li.parentElement.children].indexOf(li), ctl: t.closest('.recent-manage') ? 'manage' : t.dataset.fk || ''};
  };
  dialog.addEventListener('focusin', e => { memo = key(e.target); });
  const usable = c => c && !c.disabled && c.isConnected;
  function restore(){
    if(!dialog.open || document.querySelector('dialog[open]:not(.tool-work)')) return;
    let target = null;
    if(memo){
      const sec = body.querySelector(`section[data-sec="${memo.sec}"]`), rows = sec ? [...sec.querySelectorAll('li[data-rid]')] : [];
      const same = rows.find(li => li.dataset.rid === memo.rid), next = rows[Math.min(memo.at, rows.length - 1)];
      for(const li of [same, next]){
        if(!li) continue;
        const own = [...li.querySelectorAll('[data-fk]')].find(c => c.dataset.fk === memo.ctl && usable(c));
        target = own || [...li.querySelectorAll('[data-fk]')].find(usable);
        if(target) break;
      }
    }
    (target || close).focus();
  }
  /* a nested dialog (rename, remove) hands focus to the row it opened from, which has been repainted */
  const afterNested = e => { if(e.target !== dialog) setTimeout(restore, 0); };
  document.addEventListener('close', afterNested, true);
  dialog.addEventListener('focusout', e => { if(!e.relatedTarget) setTimeout(() => { if(dialog.open && document.activeElement === document.body) restore(); }, 0); });

  /* ---- content ---- */
  const refresh = () => { paint(); restore(); };
  function paint(){
    const problems = new Set(), sections = [];
    const add = (id, title, ...nodes) => { const s = el('section'); s.dataset.sec = id; s.append(el('h3', title), ...nodes); sections.push(s); };
    let records = [], draft = false;
    try{
      const native = readNativeWork(localStorage, {scope, pathname: location.pathname});
      if(native.unreadable.length) problems.add('Some saved work could not be listed. Use Backup & restore to recover it.');
      draft = native.records.some(r => r.tool === tool && r.kind === 'draft');
      const recent = store().list().filter(r => r.tool === tool).map(r => {
        const k = `mg:recent:v1:${scope}:${r.id}`;
        return {...r, key: k, copyId: r.id, id: workId(k), kind: 'copy', toolName: RECENT_TOOLS[scope][tool]};
      });
      const organised = decorateWork(localStorage, [...native.records.filter(r => r.tool === tool && ['copy', 'baseline'].includes(r.kind)), ...recent]);
      if(organised.unreadable.length) problems.add('Some work organisation needs recovery. Use Backup & restore.');
      records = organised.records;
    }catch(error){ problems.add(failure(error)); }

    const rows = (rs, label, open, remove) => {
      const ul = el('ul', null, 'recent-list');
      for(const r of rs){
        const li = el('li'), a = el('a', null, 'recent-open');
        li.dataset.rid = r.id; a.dataset.fk = 'open';
        a.append(el('span', (r.pinned ? '★ ' : '') + r.name, 'recent-name'), el('span', label + ' · ' + when(r), 'recent-meta'));
        open(a, r); li.append(a); ul.append(li);
        mountWorkActions(li, r, {refresh, announce: m => { alert.textContent = m; }, ...(remove && {remove: () => remove(r)}), ...(r.copyId && {rename: n => store().rename(r.copyId, n)})});
        li.querySelector('summary').dataset.fk = 'manage';
      }
      return ul;
    };
    /* a copy opens by reloading this page on its link: a hash change alone would not reboot the tool */
    const openCopy = (a, r) => {
      const go = hash => { a.href = recentRoute(scope, tool, location.pathname) + '#' + hash; a.removeAttribute('aria-disabled'); };
      if(r.hash) go(r.hash);
      else { a.setAttribute('aria-disabled', 'true'); encodeHash(r.state).then(go, () => { a.href = r.href; a.removeAttribute('aria-disabled'); }); }
      a.addEventListener('click', e => {
        if(a.hasAttribute('aria-disabled')) return e.preventDefault();
        if(!a.hash) return;
        e.preventDefault(); location.hash = a.hash; location.reload();
      });
    };
    const removeLegacy = r => {
      const kept = JSON.parse(localStorage.getItem(r.key) || '[]').filter(item => itemId(item) !== r.localId);
      saveTrackedWork(localStorage, r.key, JSON.stringify(kept));
    };
    const rm = r => r.copyId ? store().remove(r.copyId) : removeLegacy(r);
    const copies = records.filter(r => r.kind === 'copy'), live = copies.filter(r => !r.archived), kept = copies.filter(r => r.archived);
    if(live.length) add('copies', 'Saved copies', rows(live, 'Saved copy', openCopy, rm));
    if(caps.templates) templates(add, problems);
    const bases = records.filter(r => r.kind === 'baseline' && !r.archived);
    if(bases.length) add('baselines', 'Comparison baselines', rows(bases, 'Baseline · open in History', (a, r) => { a.href = r.href; }));
    if(kept.length) add('archived', 'Archived', rows(kept, 'Archived copy', openCopy, rm));

    const notes = [...problems].map(p => el('p', p, 'recent-note'));
    if(!sections.length && !problems.size)
      notes.push(el('p', SOURCE_TOOLS.includes(tool) && draft ? `No saved copies of ${name} yet. Your draft is kept in this browser as you work.`
        : `Nothing saved for ${name} yet. Save a copy from the File menu to keep this model.`, 'recent-note'));
    const all = document.querySelector('.mg-footer a[href$="#recent-work"]'), more = el('a', 'See all your work', 'tool-work-all');
    more.href = all?.getAttribute('href') || '/#recent-work';
    body.replaceChildren(alert, ...sections, ...notes, more);
  }

  function templates(add, problems){
    const shelf = templateStore(localStorage, scope, tool, 'Your work');
    let items = [], issues = [], current = null, broken = false;
    try{ ({items, issues} = shelf.list()); }catch(error){ problems.add(failure(error)); return; }
    try{ current = shelf.getDefault(); }catch(error){ broken = true; problems.add(error.message); }
    if(!items.length && !issues.length && !current && !broken && wanted !== 'templates') return;
    const act = fn => () => { try{ fn(); refresh(); }catch(error){ alert.textContent = failure(error); } };
    const nodes = [];
    if(issues.length) nodes.push(el('p', `${issues.length} unreadable template${issues.length === 1 ? '' : 's'} kept for recovery. Export a browser backup before replacing any data.`, 'recent-note'));
    if(!items.length && !broken) nodes.push(el('p', 'No templates yet. Choose Save as template… in the File menu to keep this model as one.', 'recent-note'));
    if(current || broken){
      const clear = button(caps.blank ? 'Use blank as default' : 'Clear default');
      clear.addEventListener('click', act(() => shelf.clearDefault()));
      const li = el('li'); li.dataset.rid = 'default'; clear.dataset.fk = 'clear'; li.append(clear);
      const ul = el('ul', null, 'tool-templates'); ul.append(li); nodes.push(ul);
    }
    const ul = el('ul', null, 'tool-templates');
    for(const t of items){
      const li = el('li'), actions = el('div', null, 'tool-row-actions'), isDefault = current?.id === t.id;
      li.dataset.rid = t.id;
      const mk = (label, fk, aria, extra = {}) => { const b = Object.assign(button(label), extra); b.dataset.fk = fk; if(aria) b.setAttribute('aria-label', aria); return b; };
      const idle = () => {
        const start = mk('Start', 'start', 'Start from ' + t.name), def = mk(isDefault ? 'Default' : 'Make default', 'default', isDefault ? '' : 'Make ' + t.name + ' the default', {disabled: isDefault});
        const rename = mk('Rename', 'rename', 'Rename ' + t.name), del = mk('Delete', 'delete', 'Delete ' + t.name);
        start.addEventListener('click', () => caps.templates.start(t));
        def.addEventListener('click', act(() => shelf.setDefault(t)));
        rename.addEventListener('click', () => {
          const form = el('form', null, 'tool-row-actions'), label = el('label', 'Template name'), input = el('input'), save = mk('Save name', 'rename'), cancel = mk('Cancel', 'rename');
          input.type = 'text'; input.required = true; input.maxLength = 120; input.value = t.name; input.dataset.fk = 'rename'; save.type = 'submit'; label.append(input); form.append(label, save, cancel);
          form.addEventListener('submit', e => { e.preventDefault(); if(input.value.trim()) act(() => shelf.rename(t, input.value))(); });
          cancel.addEventListener('click', refresh);
          actions.replaceChildren(form); input.focus(); input.select();
        });
        del.addEventListener('click', () => {
          const keep = mk('Keep template', 'delete'), gone = mk('Delete template', 'delete');
          keep.addEventListener('click', refresh); gone.addEventListener('click', act(() => shelf.remove(t)));
          actions.replaceChildren(el('span', `Delete “${t.name}”?`), keep, gone); keep.focus();
        });
        actions.replaceChildren(start, def, rename, del);
      };
      idle();
      li.append(el('strong', t.name), el('span', isDefault ? 'Default starting point' : 'Saved starting point', 'recent-meta'), actions);
      ul.append(li);
    }
    if(items.length) nodes.push(ul);
    add('templates', 'Templates', ...nodes);
  }

  paint();
  dialog.showModal();
  if(wanted === 'templates') body.querySelector('section[data-sec=templates] h3')?.scrollIntoView({block: 'start'});
}

/* Save as template…: a name and nothing else; templates are then managed in Your work. */
export function saveTemplate({caps, opener}){
  const dialog = el('dialog', null, 'mg-template-dialog'), heading = el('h2', 'Save as template'), error = el('p'), form = el('form'), label = el('label', 'Template name');
  const input = el('input'), actions = el('div', null, 'mg-template-actions'), cancel = button('Cancel'), save = el('button', 'Save template');
  heading.id = tool + '-template-save'; dialog.setAttribute('aria-labelledby', heading.id); error.setAttribute('role', 'alert');
  input.type = 'text'; input.required = true; input.maxLength = 120; input.value = caps.templates.suggest().slice(0, 120); save.type = 'submit';
  label.append(input); actions.append(cancel, save); form.append(label, actions); dialog.append(heading, error, form); document.body.append(dialog);
  cancel.addEventListener('click', () => dialog.close());
  input.addEventListener('input', () => input.setCustomValidity(''));
  dialog.addEventListener('close', () => { dialog.remove(); opener.focus(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if(!input.value.trim()){ input.setCustomValidity('Give this template a name.'); input.reportValidity(); return; }
    save.disabled = true;
    try{ await caps.templates.addNamed(input.value); dialog.close(); }
    catch(err){ error.textContent = failure(err); save.disabled = false; }
  });
  dialog.showModal(); input.focus(); input.select();
}
