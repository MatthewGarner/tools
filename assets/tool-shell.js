/* Behaviour for the stamped header (dev/sync-shell.mjs). The markup is static; this
   attaches handlers to it and never adds header elements. Pages hand over what they
   can do with provide() (also reached by mountRecentSave and mountModelLink): getState, getHash, save, templates, blank, examples as
   [{name, pick}], items as {id: fn}. An undefined value or an empty examples list
   never counts. {withdraw: true} takes every offer back and hides File and Share. data-shell-ready is set once every stamped control is wired. The
   Your work panel loads on first use (tool-work.js). */
import {button, shellRow, offer} from './recent-ui.js';
import {shareModel} from './model-link.js';
import {trapPopoverFocus} from './popover-focus.js';

export {offer as provide};
const row = shellRow();
if(row) init(row);

function init(row){
  const header = row.closest('[data-tool-header]'), file = row.querySelector('[data-shell-file]'), summary = file.querySelector('summary');
  const menu = file.querySelector('.tool-menu'), status = row.querySelector('[role=status]');
  const list = row.querySelector('[data-shell-examples-list]'), toggle = row.querySelector('[data-act=examples]');
  const name = row.querySelector('h1').textContent, caps = {};
  const strip = header.querySelector(':scope > .series');
  if(strip) initStrip(strip);
  const need = {
    save: () => caps.save, new: () => caps.blank, 'new-template': () => caps.templates, template: () => caps.templates,
    share: () => caps.getState || caps.getHash, examples: () => caps.examples, item: b => caps.items?.[b.dataset.item],
    work: () => 1, backup: () => 1,
  };
  const wire = () => {
    /* a page that withdrew its offer (Gauge's participant and console modes) shows the title alone:
       nothing visible is left to wire, so the header is as ready as it will get */
    if(row.hasAttribute('data-shell-off')){ header.setAttribute('data-shell-ready', ''); return; }
    caps.templates?.setBlank(caps.blank);
    caps.templates?.setManager(() => work('templates'));
    let ready = true;
    for(const b of row.querySelectorAll('[data-act]')){
      const ok = !!need[b.dataset.act](b);
      if(b.tagName === 'BUTTON') b.disabled = !ok;
      ready &&= ok;
    }
    header.toggleAttribute('data-shell-ready', ready);
  };
  const absorb = () => {
    for(const o of row.shellOffers?.splice(0) ?? []){
      if(o.withdraw){ for(const key of Object.keys(caps)) delete caps[key]; row.setAttribute('data-shell-off', ''); continue; }
      row.removeAttribute('data-shell-off');
      for(const [key, value] of Object.entries(o)){
        if(value === undefined || (key === 'examples' && !value.length)) continue;
        caps[key] = key === 'items' ? {...caps.items, ...value} : value;
      }
    }
    wire();
  };
  row.addEventListener('shell-offer', absorb); absorb();

  /* ---- File menu ---- */
  const POPOVER = 'details.action-disclosure';
  const closeMenu = () => { file.open = false; };
  const closeAndFocus = () => { closeMenu(); summary.focus(); };
  let trapped = false;
  file.addEventListener('toggle', () => {
    if(file.open){
      for(const other of document.querySelectorAll(POPOVER + '[open]')) other.open = false;
      if(trapped) menu.querySelector('button:not(:disabled)')?.focus();
      else { trapped = true; trapPopoverFocus(menu, closeAndFocus, {trap: false, items: 'button, a[href]'}); }
    } else collapse();
  });
  /* opening another popover (Roadmap's Appearance) closes File */
  document.addEventListener('toggle', e => { if(file.open && e.target.matches?.(POPOVER) && e.target.open) closeMenu(); }, true);
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
  /* the panel is its own module, fetched on first use */
  const lazy = async fn => {
    try{ fn(await import('./tool-work.js')); }
    catch{ status.textContent = 'Could not load that. Reload and try again.'; }
  };
  const work = section => lazy(m => m.openWork({name, caps, opener: summary, status, section, workspaces: row.dataset.workspaces}));
  const run = {
    new: () => caps.templates ? caps.templates.newWork() : caps.blank(),
    'new-template': () => caps.templates.newWork(),
    examples: () => toggle.getAttribute('aria-expanded') === 'true' ? collapse() : expand(),
    work: () => work(),
    save: () => caps.save(summary),
    template: () => lazy(m => m.saveTemplate({caps, opener: summary})),
    item: b => caps.items[b.dataset.item](),
    share: () => shareModel({getState: caps.getState, getHash: caps.getHash, maxLength: caps.shareMax, status, button: shareButton,
      done: 'Link copied. It opens as a separate copy.', title: 'Share link'}),
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
}

/* Energy's E1-E5 strip: bring the current item on screen by moving the strip itself (never the page), keep an
   edge fade honest about which sides still hide something, and leave the reader's own scrolling alone. */
function initStrip(strip){
  let touched = false;
  const fade = () => {
    const max = strip.scrollWidth - strip.clientWidth;
    if(max <= 1) strip.removeAttribute('data-fade');
    else strip.dataset.fade = strip.scrollLeft <= 1 ? 'end' : strip.scrollLeft >= max - 1 ? 'start' : 'both';
  };
  const centre = () => {
    const current = strip.querySelector('[aria-current]');
    if(current && !touched) strip.scrollLeft = Math.max(0, current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2);
    fade();
  };
  for(const type of ['pointerdown', 'wheel', 'keydown']) strip.addEventListener(type, () => { touched = true; }, {passive: true});
  strip.addEventListener('scroll', fade, {passive: true});
  new ResizeObserver(centre).observe(strip);
  centre();
  document.fonts?.ready.then(centre);
}
