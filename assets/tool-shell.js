/* Behaviour for the stamped header (dev/sync-shell.mjs). The markup is static; this
   attaches handlers to it and never adds header elements. Pages hand over what they
   can do through provide() (also reached by mountRecentSave, mountModelLink and
   mountDocumentStart): getState, getHash, save, templates, blank, examples as
   [{name, pick}], items as {id: fn}. data-shell-ready is set once every stamped
   control has what it needs. */
import {scope, tool, el, button, store, failure, shellRow, offer} from './recent-ui.js';
import {shareModel} from './model-link.js';
import {readNativeWork} from './work-store.js';
import {decorateWork, workId, itemId, saveTrackedWork} from './work-metadata.js';
import {mountWorkActions} from './work-actions.js';
import {RECENT_TOOLS, recentRoute} from './recent-store.js';
import {templateStore} from './template-store.js';
import {encodeHash} from './series.js';
import {trapPopoverFocus} from './popover-focus.js';

export {offer as provide};
const row = shellRow();
if(row) init(row);

function init(row){
  const header = row.closest('[data-tool-header]'), file = row.querySelector('[data-shell-file]'), summary = file.querySelector('summary');
  const menu = file.querySelector('.tool-menu'), status = row.querySelector('[role=status]');
  const list = row.querySelector('[data-shell-examples-list]'), toggle = row.querySelector('[data-act=examples]');
  const name = row.querySelector('h1').textContent, caps = {};
  const need = {
    save: () => caps.save, new: () => caps.blank, 'new-template': () => caps.templates, template: () => caps.templates,
    share: () => caps.getState || caps.getHash, examples: () => caps.examples, item: b => caps.items?.[b.dataset.item],
    work: () => 1, backup: () => 1,
  };
  const wire = () => {
    caps.templates?.setBlank(caps.blank);
    let ready = true;
    for(const b of row.querySelectorAll('[data-act]')){
      const ok = !!need[b.dataset.act](b);
      if(b.tagName === 'BUTTON') b.disabled = !ok;
      ready &&= ok;
    }
    header.toggleAttribute('data-shell-ready', ready);
  };
  const absorb = () => {
    for(const o of row.shellOffers?.splice(0) ?? []) Object.assign(caps, o, o.items && {items: {...caps.items, ...o.items}});
    wire();
  };
  row.addEventListener('shell-offer', absorb); absorb();

  /* ---- File menu ---- */
  const closeMenu = () => { file.open = false; };
  const closeAndFocus = () => { closeMenu(); summary.focus(); };
  let trapped = false;
  file.addEventListener('toggle', () => {
    if(file.open){
      if(trapped) menu.querySelector('button:not(:disabled)')?.focus();
      else { trapped = true; trapPopoverFocus(menu, closeAndFocus, {trap: false}); }
    } else collapse();
  });
  file.addEventListener('keydown', e => { if(e.key === 'Escape' && file.open){ e.preventDefault(); closeAndFocus(); } });
  file.addEventListener('focusout', e => { if(file.open && e.relatedTarget && !file.contains(e.relatedTarget)) closeMenu(); });
  document.addEventListener('pointerdown', e => { if(file.open && !file.contains(e.target)) closeMenu(); });

  function collapse(){ if(!toggle) return; toggle.setAttribute('aria-expanded', 'false'); list.hidden = true; list.replaceChildren(); }
  function expand(){
    toggle.setAttribute('aria-expanded', 'true');
    list.replaceChildren(...caps.examples.map(ex => {
      const b = button(ex.name);
      b.addEventListener('click', () => { closeAndFocus(); ex.pick(); });
      return b;
    }));
    list.hidden = false;
  }

  const shareButton = row.querySelector('[data-act=share]');
  const run = {
    new: () => caps.templates ? caps.templates.newWork() : caps.blank(),
    'new-template': () => caps.templates.newWork(),
    examples: () => toggle.getAttribute('aria-expanded') === 'true' ? collapse() : expand(),
    work: () => openWork(),
    save: () => caps.save(summary),
    template: () => caps.templates.saveCurrent(),
    item: b => caps.items[b.dataset.item](),
    share: () => shareModel({getState: caps.getState, getHash: caps.getHash, maxLength: caps.shareMax, status, button: shareButton}),
  };
  row.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if(!b || b.disabled || !run[b.dataset.act]) return;
    if(b.dataset.act !== 'examples' && b !== shareButton) closeAndFocus();
    run[b.dataset.act](b);
  });
  /* Results fade after a while so the line never lingers over the page. */
  let timer;
  new MutationObserver(() => { clearTimeout(timer); if(status.textContent) timer = setTimeout(() => { status.textContent = ''; }, 8000); })
    .observe(status, {childList: true, characterData: true, subtree: true});

  /* ---- Your work in {name} ---- */
  function openWork(){
    const dialog = el('dialog', null, 'recent-dialog tool-work'), heading = el('h2', 'Your work in ' + name), alert = el('p', null, 'recent-note');
    const body = el('div'), footer = el('div', null, 'recent-dialog-actions'), close = button('Close');
    const all = document.querySelector('.mg-footer a[href$="#recent-work"]'), more = el('a', 'See all your work', 'tool-work-all');
    more.href = all?.getAttribute('href') || '/#recent-work';
    heading.id = 'tool-work-title'; dialog.setAttribute('aria-labelledby', heading.id); alert.setAttribute('role', 'status');
    footer.append(close, more); dialog.append(heading, alert, body, footer); document.body.append(dialog);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { watch.disconnect(); dialog.remove(); summary.focus(); });
    /* Template and save failures report on the page's status line; mirror them here. */
    const watch = new MutationObserver(() => { if(status.textContent) alert.textContent = status.textContent; });
    watch.observe(status, {childList: true, characterData: true, subtree: true});
    const refresh = () => paint(body, alert, refresh);
    paint(body, alert, refresh);
    dialog.showModal();
  }
  function paint(body, alert, refresh){
    const sections = [], when = r => new Date(r.savedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
    const section = (title, ul) => { const s = el('section'); s.append(el('h3', title), ul); sections.push(s); };
    let issue = '', records = [];
    try{
      const native = readNativeWork(localStorage, {scope, pathname: location.pathname});
      if(native.unreadable.length) issue = 'Some saved work could not be listed. Use Backup & restore to recover it.';
      const recent = store().list().filter(r => r.tool === tool).map(r => {
        const key = `mg:recent:v1:${scope}:${r.id}`;
        return {...r, key, copyId: r.id, id: workId(key), kind: 'copy', toolName: RECENT_TOOLS[scope][tool]};
      });
      const organised = decorateWork(localStorage, [...native.records.filter(r => r.tool === tool && ['copy', 'baseline'].includes(r.kind)), ...recent]);
      if(organised.unreadable.length) issue = 'Some work organisation needs recovery. Use Backup & restore.';
      records = organised.records;
    }catch(error){ issue = failure(error); }
    const item = (r, rest) => {
      const li = el('li'), a = el('a', null, 'recent-open');
      a.append(el('span', (r.pinned ? '★ ' : '') + r.name, 'recent-name'), el('span', rest + ' · ' + (r.savedAt ? when(r) : 'Date unavailable'), 'recent-meta'));
      li.append(a);
      return {li, a};
    };
    const rows = (rs, label, open, remove) => {
      const ul = el('ul', null, 'recent-list');
      for(const r of rs){
        const {li, a} = item(r, label);
        open(a, r);
        ul.append(li);
        mountWorkActions(li, r, {refresh, announce: m => { alert.textContent = m; }, ...(remove && {remove: () => remove(r)}),
          ...(r.copyId && {rename: n => store().rename(r.copyId, n)})});
      }
      return ul;
    };
    /* A copy opens by reloading this page on its link: a hash change alone would not reboot the tool. */
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
    const copies = records.filter(r => r.kind === 'copy'), live = copies.filter(r => !r.archived), kept = copies.filter(r => r.archived);
    const rm = r => r.copyId ? store().remove(r.copyId) : removeLegacy(r);
    if(live.length) section('Saved copies', rows(live, 'Saved copy', openCopy, rm));
    const bases = records.filter(r => r.kind === 'baseline' && !r.archived);
    if(bases.length) section('Comparison baselines', rows(bases, 'Baseline · open in History', (a, r) => { a.href = r.href; }));
    if(caps.templates) templateSection(section, refresh, alert);
    if(kept.length) section('Archived', rows(kept, 'Archived copy', openCopy, rm));
    if(!sections.length && !issue) body.replaceChildren(el('p', `Nothing saved for ${name} yet. Save a copy from the File menu to keep this model.`, 'recent-note'));
    else body.replaceChildren(...sections, ...(issue ? [el('p', issue, 'recent-note')] : []));
  }
  function templateSection(section, refresh, alert){
    let items = [], current = null;
    const shelf = templateStore(localStorage, scope, tool);
    try{ items = shelf.list().items; current = shelf.getDefault(); }catch(error){ alert.textContent = failure(error); }
    if(!items.length) return;
    const ul = el('ul', null, 'tool-templates');
    const act = fn => () => { try{ fn(); refresh(); }catch(error){ alert.textContent = failure(error); } };
    for(const t of items){
      const li = el('li'), actions = el('div', null, 'tool-row-actions');
      const swap = (...children) => actions.replaceChildren(...children);
      const idle = () => swap(
        button('Start'), Object.assign(button(current?.id === t.id ? 'Default' : 'Make default'), {disabled: current?.id === t.id}),
        button('Rename'), button('Delete'));
      idle();
      const [start, makeDefault, rename, del] = actions.children;
      start.setAttribute('aria-label', 'Start from ' + t.name); if(!makeDefault.disabled) makeDefault.setAttribute('aria-label', 'Make ' + t.name + ' the default');
      rename.setAttribute('aria-label', 'Rename ' + t.name); del.setAttribute('aria-label', 'Delete ' + t.name);
      start.addEventListener('click', () => caps.templates.start(t));
      makeDefault.addEventListener('click', act(() => shelf.setDefault(t)));
      rename.addEventListener('click', () => {
        const form = el('form', null, 'tool-row-actions'), label = el('label', 'Template name'), input = el('input'), save = button('Save name'), cancel = button('Cancel');
        input.type = 'text'; input.required = true; input.maxLength = 120; input.value = t.name; save.type = 'submit'; label.append(input); form.append(label, save, cancel);
        form.addEventListener('submit', e => { e.preventDefault(); if(input.value.trim()) act(() => shelf.rename(t, input.value))(); });
        cancel.addEventListener('click', refresh);
        swap(form); input.focus(); input.select();
      });
      del.addEventListener('click', () => {
        const keep = button('Keep template'), gone = button('Delete template');
        keep.addEventListener('click', refresh); gone.addEventListener('click', act(() => shelf.remove(t)));
        swap(el('span', `Delete “${t.name}”?`), keep, gone); keep.focus();
      });
      li.append(el('strong', t.name), el('span', current?.id === t.id ? 'Default starting point' : 'Saved starting point', 'recent-meta'), actions);
      ul.append(li);
    }
    section('Templates', ul);
  }
}
