/* State, refresh loop, snapshot slip-compare, edit-in-place, exports, boot. */
import {parse, STATUSES} from './parse.js';
import {render, toMarkdown, timelineVerdict, timelineReadout} from './render.js';
import {timelineDiff, timelineDiffView} from './diff.js';
import {premortemHandoff} from './handoff.js';
import {toLink as premortemLink} from '../premortem/store.js';
import {createEditor} from './editor.js';
import {validators, editLabel, editDates, setStatus, setLane, editNote,
  addItemLine, addedItemTarget, removeItemLine, editStarted, setConfig} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {handoffReturnHref} from '../assets/handoff.js';
import {setVerdictText, verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips, download, pngRasterPlan, svgToCanvas} from '../assets/app-common.js';
import {observatoryPages, observatoryColors} from './observatory.js';
import {loadChapterFonts, chapterFontsReady, embedChapterFonts} from '../roadmap/chapter-font-loader.js';
import {stripEmbeddedFonts} from '../roadmap/chapter-fonts.js';
import {createSlideZip} from '../roadmap/export-zip.js';
import {inspectorHTML} from './inspector.js';
import {mountActionIcons} from '../assets/action-icons.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const todayDay = () => Math.floor(Date.now() / 86400000);
const todayISO = () => new Date().toISOString().slice(0, 10);

const EXAMPLES = [
  {name: 'App launch programme', src:
`title: Lantern — launch forecast
today: 2026-09-05
style: field
font: Chapter
accent: #326752
App: Beta cut 2026-09-18 .. 2026-10-02 [started: 2026-08-14]
App: Store review 2026-10-19 .. 2026-11-16 // External review timing
Assurance: Privacy audit 2026-10-12 .. 2026-11-23 [started: 2026-08-24] // Independent assessment
Launch: Campaign ready 2026-11-02 .. 2026-11-16
Launch: Launch forecast 2026-11-20 .. 2026-12-11
Launch: Conference 2026-12-15 [fixed]`},
  {name: 'Six-quarter programme', src:
`title: Northstar — six-quarter programme
today: 2026-09-05
style: field
font: DM Sans
Platform: Architecture approved 2026-10-12 .. 2026-11-16 [started: 2026-08-24]
Platform: Pilot ready 2027-02 .. 2027-03 // Validate with the first cohort
Platform: General availability 2027-05 .. 2027-07
Experience: Research complete 2026-11 .. 2026-12 [started: 2026-09-01]
Experience: New onboarding 2027-03 .. 2027-05
Experience: International launch 2027-09 .. 2027-12 // Localisation and support readiness
Assurance: External audit 2027-08 .. 2027-10
Assurance: Contract renewal 2027-12-15 [fixed] [lead: 8w]`},
  {name: 'Office move', src:
`title: Office move
Lease signed 2026-06-20 [done]
Old lease expires 2027-02-28 [fixed] [lead: 6w]
Fit-out: Design approved 2026-07 .. 2026-08
Fit-out: Construction done 2026-09 .. 2026-12 // contractor's range, not ours
IT: Network installed 2026-11 .. 2027-01
IT: Desks and AV 2026-12 .. 2027-01
Move-in day 2027-01 .. 2027-02`},
];

let model = null, lastSvg = '', hashTimer = null;
let snaps = null;
let selectedKey = null, selectedLine = null, inspectorEditing = false, selectionOrigin = null;
let deckCache = null;

function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !model.items.length) return null;
  return timelineDiffView(timelineDiff(cur.model, model), cur.label);
}
function ctx(intent){
  return {colors: themeColors(), measure, intent, dark: isDark(), today: todayDay(), selectedKey};
}
function activeRender(intent, edit = false, width){
  return render(model, {...ctx(intent),...(width?{width}:{})}, currentDiff(), {edit,intent});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  /* Empty is a first-class Field: it carries the keyboard add route and the
     same native/presentation export boundary as a populated forecast. */
  if(!chapterFontsReady()) return;
  const width=Math.max(280, Math.round(pv.getBoundingClientRect().width)),intent=width<600?'live-narrow':'live-wide';
  const svg = activeRender(intent,true,width);
  paint(svg, REVEAL, {flipAttr: 'data-mskey', scale: ws.scale, onSwap: ws.applyZoom, mode: motionOverride});
  lastSvg = svg;
  motionOverride = undefined;
  renderWarnings();
  deckCache = null;
  syncSettings();
  syncInspector();
  $('readout').textContent = timelineReadout(model, model.today ?? todayDay());
  setActionsEnabled(!!lastSvg);
  $('exportdeck').disabled = !model.items.length;
  $('copypng').hidden = deckSet()?.pages.length !== 1;
  /* #93: the hop appears only when there is a merge to premortem (never a dead link) */
  $('topremortem').hidden = !(model && model.items.length && premortemHandoff(model, todayDay()));
  if(shouldPersist()){ try{ localStorage.setItem('timeline-src', text); }catch(e){} }
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
const refresh = rafBatched(doRefresh);
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: debounced(refresh, 120),
});
mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
function writeHash(){
  if(!shouldPersist()) return;
  const state = {t: editor.getText()};
  state.e = ws.collapsed() ? 0 : 1;
  writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('timeline-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => todayISO() + (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.items.length,
  onChange(){ lastSvg = ''; refresh(); },
});
// Initial collapse invokes its callback before initWorkspace returns.
let ws;
ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  initialCollapsed: true,
  focusEditor: () => editor.view.focus(),
  onCollapseChange(){ if(!ws)return; $('editsource').setAttribute('aria-expanded', String(!ws.collapsed())); clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});
const paint = mountMotion($('preview'));   // reveal on load, zoom-scaled FLIP on edit
let motionOverride;                         // 'none' for theme/relayout re-renders

/* the phone card menu ("the card is the control"): Rename/Dates open the inline
   field target; Status/Lane are marked-picker submenus that commit directly (a
   coarse tap never blind-steps); Note opens the free-text anchor; Remove is a
   danger action. Resolved fresh from the current model each open (roadmap's
   itemMenu idiom), keyed on the tapped row's own srcLine. */
function milestoneMenu(m, srcLine){
  const it = m && m.items.find(i => i.srcLine === srcLine);
  const cur = (it && it.status) || '';
  const statusRow = {label: 'Status…', submenu: ['', ...STATUSES].map(st => ({
    label: st || 'none', on: cur === st,
    commit: {kind: 'status', line: srcLine, oldRaw: cur, value: st},
  }))};
  /* existing lanes are quick-picks; "New lane…" opens the setlane anchor's input
     so any name (existing or brand-new) can be typed — a lane exists once one
     item carries it. */
  const laneRow = {label: 'Lane…', submenu: [
    ...m.lanes.filter(Boolean).map(l => ({
      label: l, on: !!(it && it.lane === l),
      commit: {kind: 'setlane', line: srcLine, oldRaw: (it && it.lane) || '', value: l},
    })),
    {label: 'New lane…', opens: 'setlane'},
  ]};
  return [
    {label: 'Rename…', opens: 'label'},
    {label: 'Dates…', opens: 'dates'},
    ...(it?.status === 'fixed' ? [] : [{label: it?.started != null ? 'Edit actual start…' : 'Add actual start…', opens: 'started'}]),
    statusRow,
    laneRow,
    {label: (it && it.note) ? 'Edit note…' : 'Add note…', opens: 'note'},
    {label: 'Remove milestone', danger: true},
  ];
}

const eip = attachEditInPlace($('preview'), {
  kinds: {
    label: {validate: validators.label},
    dates: {validate: validators.dates},
    /* the real state list (not the ['cycle'] sentinel): a FINE click still steps
       '' → done → risk → '' instantly (edit-in-place hands us the next value), a
       COARSE tap opens the marked picker — no silent status commit on any coarse
       pointer, wide or narrow (the Stage-0 [IMPORTANT] fix). */
    status: {cycle: ['', ...STATUSES]},
    setlane: {validate: validators.lane},
    note: {validate: validators.note},
    started: {validate: validators.started},
    additem: {validate: validators.label},
    removeitem: {cycle: ['×']},
    cardmenu: {menu: (el) => milestoneMenu(model, +el.dataset.line)},
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => model ? timelineVerdict(model, todayDay()).line : ''},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|palette|accent|today|verdict|style|font)\s*:/i,
      getLine: () => model ? timelineVerdict(model, todayDay()).line : '',
    })) return;
    if(kind === 'additem'){
      const r = addItemLine(editor.getText(), todayISO(), el.dataset.lane || undefined);
      const label = newValue.replace(/^✖/, '').trim();
      const line = r.newLine.replace('New milestone', label || 'New milestone');
      /* The add input already collected the name in the artefact. One source
         insertion is the whole commit; once the normal render catches up,
         focus the exact fresh label without reopening an input or touching CM. */
      editor.insertLinesAfter(r.afterLine, [line]);
      eip.focusAt(addedItemTarget(r, label), {origin: el});
      return;
    }
    if(kind === 'removeitem' || newValue === '✖Remove milestone'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = kind === 'status' ? setStatus(line, newValue)
      : kind === 'setlane' ? setLane(line, newValue)
      : kind === 'started' ? editStarted(line, newValue)
      : kind === 'note' ? editNote(line, oldRaw, newValue)
      : kind === 'dates' ? editDates(line, oldRaw, newValue)
      : editLabel(line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

/* ---------- exports ---------- */
function svgString(intent){
  return model && chapterFontsReady() ? embedChapterFonts(activeRender(intent, false)) : null;
}
function slug(){ return slugify(model.title, 'timeline'); }
function deckSet(){
  if(!model || !chapterFontsReady()) return null;
  if(deckCache) return deckCache;
  const set = observatoryPages(model,{...ctx('presentation'), selectedKey:null},currentDiff());
  if(!set?.complete || !set.pages?.length) return null;
  deckCache = {...set,pages:set.pages.map(page => embedChapterFonts(typeof page === 'string' ? page : page.svg))};
  return deckCache;
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => svgString('native'),
  getCopy: () => {const set=deckSet(); return set?.pages.length === 1 ? set.pages[0] : null;},
  descriptions:{copypng:'Copy the complete timeline as one slide PNG'},
  slug,
});
let slidePageIndex = 0;
function renderSlidePage(index){
  const set=deckSet(); if(!set) return;
  slidePageIndex=Math.max(0,Math.min(index,set.pages.length-1));
  $('slidecanvas').innerHTML=stripEmbeddedFonts(set.pages[slidePageIndex]);
  $('slideposition').textContent=`Slide ${slidePageIndex+1} of ${set.pages.length}`;
  $('slideprev').disabled=slidePageIndex===0;
  $('slidenext').disabled=slidePageIndex===set.pages.length-1;
  $('slidedownload').textContent=set.pages.length===1?'Download slide PNG':`Download ${set.pages.length}-slide ZIP`;
}
function openSlidePreview(){
  const available=!!deckSet();
  $('slideerror').hidden=available;
  for(const id of ['slidecanvas','slideposition','slideprev','slidenext','slidedownload']) $(id).hidden=!available;
  if(available)renderSlidePage(0);
  $('slidepreviewdialog').showModal();
}
function pngFromSvg(svg){
  return new Promise((resolve,reject)=>{
    const plan=pngRasterPlan(svg);if(!plan.ok)return reject(new Error(plan.detail));
    svgToCanvas(svg,canvas=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed')),'image/png');}catch(error){reject(error);}},error=>reject(new Error(error.detail)));
  });
}
$('exportdeck').addEventListener('click',openSlidePreview);
$('slideclose').addEventListener('click',()=>$('slidepreviewdialog').close());
$('slideprev').addEventListener('click',()=>renderSlidePage(slidePageIndex-1));
$('slidenext').addEventListener('click',()=>renderSlidePage(slidePageIndex+1));
$('slidedownload').addEventListener('click',async()=>{
  const set=deckSet();if(!set)return;
  const button=$('slidedownload'),label=button.textContent;
  button.disabled=true;
  try{
    const files=[];
    for(let i=0;i<set.pages.length;i++){
      button.textContent=`Preparing ${i+1} of ${set.pages.length}`;
      files.push({name:`${slug()}-slide-${String(i+1).padStart(2,'0')}.png`,bytes:new Uint8Array(await (await pngFromSvg(set.pages[i])).arrayBuffer())});
    }
    if(files.length===1)download(files[0].name,new Blob([files[0].bytes],{type:'image/png'}));
    else download(`${slug()}-slides.zip`,createSlideZip(files));
    button.textContent='Downloaded';
  }catch(error){button.textContent='Could not prepare slides — use SVG';}
  finally{setTimeout(()=>{button.textContent=label;button.disabled=false;},1800);}
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('topremortem').addEventListener('click', async () => {
  const returnTo = await handoffReturnHref('/timeline/',
    {t:editor.getText(), ...(ws.collapsed() ? {e:0} : {})});
  if(!returnTo){
    $('handoffstatus').textContent = 'This plan is too large to send with a safe return link. Shorten it, then try again.';
    return;
  }
  const doc = premortemHandoff(model, todayDay(), returnTo);
  if(!doc) return;
  $('handoffstatus').textContent = '';
  const link = await premortemLink(doc);   // ignore re-clicks while encoding: same doc, same link
  if(link) location.href = '/premortem/' + link;
  else $('handoffstatus').textContent = 'This plan is too large to open in Premortem. Shorten the title, then try again.';
});
$('copymd').addEventListener('click', async () => {
  if(!model) return;
  const md = toMarkdown(model, currentDiff(), location.href, todayDay());
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* fingers open at 100% zoom — pan so the first upcoming milestone lands ~30% in
   (TODAY stays in view when it's close), not the empty left board. Falls back to
   the today line if there's no [data-next] marker (empty doc). */
let panned = false;
function panToToday(){
  if(panned || !matchMedia('(pointer: coarse)').matches) return;
  const pv = $('preview');
  const next = pv.querySelector('[data-next]');
  if(next){
    /* Field P50 points are circles; fixed events remain vertical facts. Accept
       either physical representation so next-up panning stays semantic. */
    const x = parseFloat(next.getAttribute('cx') || next.getAttribute('x1'));
    const m = /M([\d.]+)/.exec(next.getAttribute('d'));
    const nextX = isFinite(x) ? x : m ? parseFloat(m[1]) : NaN;
    if(isFinite(nextX)){ pv.scrollLeft = Math.max(0, nextX - pv.clientWidth * 0.30); panned = true; return; }
  }
  const line = pv.querySelector('[data-today]');
  if(!line) return;
  const x = parseFloat(line.getAttribute('x1'));
  if(isFinite(x)){
    pv.scrollLeft = Math.max(0, x - pv.clientWidth * 0.25);
    panned = true;
  }
}
new MutationObserver(panToToday).observe($('preview'), {childList: true});

/* ---------- theme and available-width reflow ---------- */
function rerender(){ motionOverride = 'none'; paint.reset(); lastSvg = ''; deckCache=null; refresh(); }
onThemeChange(rerender);
let lastWidth=0;
new ResizeObserver(()=>{
  const width=Math.round($('preview').getBoundingClientRect().width);
  if(width && Math.abs(width-lastWidth)>2){lastWidth=width;rerender();}
}).observe($('preview'));

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 1) ws.setCollapsed(false);
  await prepareTypography();
  if(!text){
    try{ text = localStorage.getItem('timeline-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent', 'today', 'verdict', 'style', 'font']);

/* Presentation controls write the same source the renderer and URL consume. */
function syncSettings(){
  for(const button of $('stylepicker').querySelectorAll('[data-style]')) button.setAttribute('aria-pressed',String(button.dataset.style===model.style));
  if(document.activeElement!==$('fontchoice')) $('fontchoice').value=model.font || 'Chapter';
  if(/^#[0-9a-f]{6}$/i.test(model.accent || '') && document.activeElement!==$('accentchoice')) $('accentchoice').value=model.accent;
  const colors=observatoryColors(model,{dark:isDark()});
  for(const name of ['bg','ink','muted','border']) document.body.style.setProperty('--'+name,colors[name]);
  document.body.style.setProperty('--accent',colors.accent);
  document.body.style.setProperty('--accent-ink',colors.accent);
  document.documentElement.style.setProperty('--observatory-display',model.font==='DM Sans'?"'DM Sans'":"'Instrument Serif'");
  $('preview').dataset.capability=`views.${model.style || 'field'}`;
}
$('stylepicker').addEventListener('click',event=>{
  const button=event.target.closest('[data-style]');if(!button)return;
  editor.setText(setConfig(editor.getText(),'style',button.dataset.style));refresh();
});
for(const [id,key] of [['fontchoice','font'],['accentchoice','accent']]) $(id).addEventListener('change',()=>{
  editor.setText(setConfig(editor.getText(),key,$(id).value));refresh();
});
$('editsource').addEventListener('click',()=>{ws.setCollapsed(!ws.collapsed());if(!ws.collapsed())editor.view.focus();});
$('editsource').setAttribute('aria-expanded','false');
$('editsource').setAttribute('aria-controls','cmhost');
$('themechoice').value=document.documentElement.dataset.theme || 'system';
$('themechoice').addEventListener('change',()=>{
  const value=$('themechoice').value;
  if(value==='system')delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=value;
});
mountActionIcons();
async function prepareTypography(){
  try{await loadChapterFonts();$('fontstatus').hidden=true;refresh();return true;}
  catch(error){$('fontstatus').hidden=false;$('fontmessage').textContent='Typography could not load. Retry to render and export with the correct fonts.';setActionsEnabled(false);$('exportdeck').disabled=true;return false;}
}
$('retryfonts').addEventListener('click',prepareTypography);

/* Selection is a transient reading state. All authored changes remain one
   undoable text transaction and exports always retain the complete timeline. */
function selectedItem(){return model?.items.find(item=>item.identity===selectedKey);}
function syncInspector(){
  const item=selectedItem(),panel=$('inspector');
  if(!item){panel.hidden=true;selectedKey=null;selectedLine=null;return;}
  selectedLine=item.srcLine;
  panel.hidden=false;
  panel.setAttribute('role',innerWidth<=900?'dialog':'complementary');
  if(!inspectorEditing || !panel.querySelector('#inspectform')) panel.innerHTML=inspectorHTML(item,model.today ?? todayDay(),inspectorEditing);
}
function inspectRow(row){
  selectedKey=row.dataset.inspect;selectedLine=Number(row.dataset.line);selectionOrigin={key:selectedKey,line:selectedLine};inspectorEditing=false;
  syncInspector();refresh();
  requestAnimationFrame(()=>$('inspectclose')?.focus({preventScroll:true}));
}
function closeInspector(){
  const origin=selectionOrigin;
  selectedKey=null;selectedLine=null;inspectorEditing=false;$('inspector').hidden=true;refresh();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const rows=[...$('preview').querySelectorAll('[data-inspect]')];
    const row=rows.find(el=>el.dataset.inspect===origin?.key) || rows.find(el=>Number(el.dataset.line)===origin?.line);
    row?.focus({preventScroll:true});
  }));
}
$('preview').addEventListener('click',event=>{
  if(event.target.closest('[data-edit]'))return;
  const row=event.target.closest('[data-inspect]');if(row)inspectRow(row);
});
$('preview').addEventListener('keydown',event=>{
  if(event.key!=='Enter' && event.key!==' ')return;
  if(event.target.closest('[data-edit]'))return;
  const row=event.target.closest('[data-inspect]');if(!row)return;
  event.preventDefault();inspectRow(row);
});
$('inspector').addEventListener('click',event=>{
  if(event.target.closest('#inspectclose'))closeInspector();
  if(event.target.closest('#inspectedit')){inspectorEditing=true;syncInspector();$('inspectform').elements.label.focus();}
  if(event.target.closest('#inspectcancel')){inspectorEditing=false;syncInspector();$('inspectedit').focus();}
});
$('inspector').addEventListener('change',event=>{
  if(event.target.name==='status') $('inspectform').elements.started.disabled=event.target.value==='fixed';
});
$('inspector').addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,item=selectedItem();if(!item)return;
  const values={label:form.elements.label.value,dates:form.elements.dates.value,note:form.elements.note.value,started:form.elements.started.value,status:form.elements.status.value};
  let error='';
  if(!validators.label(values.label))error='Enter a name without a date or DSL tag.';
  else if(!validators.dates(values.dates))error='Use a valid finish date or a P50 .. P90 range.';
  else if(!validators.note(values.note))error='Keep commentary on one line.';
  else if(values.status!=='fixed' && !validators.started(values.started))error='Use a full calendar date for the actual start.';
  if(error){$('inspecterror').textContent=error;$('inspecterror').hidden=false;return;}
  let line=editor.getLine(item.srcLine);
  line=editLabel(line,item.label,values.label);
  line=editDates(line,item.rawDates,values.dates);
  line=setStatus(line,values.status);
  line=editStarted(line,values.status==='fixed'?'':values.started);
  line=editNote(line,item.note || '',values.note);
  editor.replaceLine(item.srcLine,line);
  selectedKey=parse(editor.getText()).items.find(it=>it.srcLine===item.srcLine)?.identity || null;
  inspectorEditing=false;refresh();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !$('inspector').hidden && !$('slidepreviewdialog').open){event.preventDefault();closeInspector();}
});
$('inspector').addEventListener('keydown',event=>{
  if(event.key!=='Tab' || innerWidth>900)return;
  const controls=[...$('inspector').querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&!el.hidden);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
});
$('slidepreviewdialog').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const controls=[...$('slidepreviewdialog').querySelectorAll('button')].filter(el=>!el.disabled&&!el.hidden),first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
