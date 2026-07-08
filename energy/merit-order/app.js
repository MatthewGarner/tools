// energy/merit-order/app.js
/* DOM shell: sliders/chips/drag/edit → buildStack → dispatch() → SVG stack +
   verdict + exports. Engine/stack/scenarios/render are pure; the DOM lives here.
   State is {condition, params, adv}: params drive buildStack; adv is per-block
   hand-edits ({name:[cap,cost]}); condition names the active Conditions preset. */
import {dispatch} from './engine.js';
import {renderStack, toMarkdown, buildVerdict, MERIT_PALETTE} from './render.js';
import {buildStack, applyAdv} from './stack.js';
import {DEFAULT_PARAMS, CONDITIONS, paramsFor} from './scenarios.js';
import {encodeStateV2, decodeStateV2} from './state.js';
import {GB_TODAY} from './technologies.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange, isDark} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';

if (typeof document !== 'undefined') boot();

function boot(){
  const $ = id => document.getElementById(id);
  const chartwrap = $('chartwrap');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fmtGW = v => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const installedOf = name => { const t = GB_TODAY.find(x => x.label === name); return t ? t.installed : null; };

  /* ---- state ---- */
  let state = {condition: null, params: {...DEFAULT_PARAMS}, adv: {}};
  let lastSvg = '', hashTimer = null;
  let wasNegative = false, lastMarginalName;
  let dragging = false;

  const currentStack = () => applyAdv(buildStack(state.params), state.adv);
  const currentState = () => ({generators: currentStack(), demand: state.params.demand});
  const palette = () => MERIT_PALETTE[isDark() ? 'dark' : 'light'];

  /* ---- chart geometry the drag math needs, mirrored from render.js ---- */
  const CHART_X0 = 116, CHART_X1 = 1200 - 32;
  const DEMAND_MAX = 64;
  function chartDomainMax(){
    const totalOffered = currentStack().reduce((s, g) => s + g.capacity, 0);
    return Math.max(totalOffered, state.params.demand, 1) * 1.04;
  }

  /* ---- demand-drag hit-rect: one persistent node, re-parented after each swap ---- */
  const hitRect = document.createElement('div');
  hitRect.className = 'demand-hit';
  hitRect.setAttribute('aria-hidden', 'true');
  hitRect.addEventListener('pointerdown', e => { e.preventDefault(); dragging = true; });

  function positionHitRect(){
    const line = chartwrap.querySelector('.demand-line');
    if(!line) return;
    const wrapRect = chartwrap.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const HIT_W = 44;
    const cx = lineRect.left + lineRect.width / 2 - wrapRect.left + chartwrap.scrollLeft;
    hitRect.style.left = (cx - HIT_W / 2) + 'px';
    hitRect.style.top = (lineRect.top - wrapRect.top + chartwrap.scrollTop) + 'px';
    hitRect.style.width = HIT_W + 'px';
    hitRect.style.height = lineRect.height + 'px';
  }

  function clientXToGW(clientX){
    const svgEl = chartwrap.querySelector('svg');
    if(!svgEl || !svgEl.createSVGPoint) return state.params.demand;
    const ctm = svgEl.getScreenCTM();
    if(!ctm) return state.params.demand;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    const p = pt.matrixTransform(ctm.inverse());
    const gw = ((p.x - CHART_X0) / (CHART_X1 - CHART_X0)) * chartDomainMax();
    return clamp(gw, 0, DEMAND_MAX);
  }

  /* snap to the exact cumulative-capacity boundary (marginal-flip point) within 0.5 GW */
  function snapDemand(gw){
    const result = dispatch(currentStack(), state.params.demand);
    let running = 0; const bounds = [0];
    for(const g of result.sorted){ running += g.capacity; bounds.push(running); }
    let snapped = null, best = 0.5;
    for(const b of bounds){ const d = Math.abs(gw - b); if(d <= best){ snapped = b; best = d; } }
    return snapped !== null ? snapped : Math.round(gw * 10) / 10;
  }

  window.addEventListener('pointermove', e => {
    if(!dragging) return;
    state.params.demand = Math.min(DEMAND_MAX, snapDemand(clientXToGW(e.clientX)));
    markCustom();
    render(false);
  });
  window.addEventListener('pointerup', () => {
    if(!dragging) return;
    dragging = false;
    render(true);
  });

  /* ---- must-run segmented toggle ---- */
  const mustrunButtons = [...document.querySelectorAll('#mustrunseg button[data-mustrun]')];
  mustrunButtons.forEach(b => b.setAttribute('role', 'radio'));
  function syncMustRunSeg(on){
    for(const b of mustrunButtons){
      const active = (b.dataset.mustrun === 'on') === on;
      b.classList.toggle('on', active);
      b.setAttribute('aria-checked', String(active));
    }
  }
  mustrunButtons.forEach(b => b.addEventListener('click', () => {
    const on = b.dataset.mustrun === 'on';
    state.params.mustRunOn = on;
    syncMustRunSeg(on);
    $('depthctl').hidden = !on;
    markCustom();
    closeCallout();
    render(true);
  }));

  /* ---- sliders: input = live cut, change = settle ---- */
  const markCustom = () => { state.condition = 'custom'; };   // any manual edit leaves the active preset
  function wireDial(id, apply){
    const el = $(id);
    el.addEventListener('input', () => { apply(+el.value); markCustom(); render(false); });
    el.addEventListener('change', () => { apply(+el.value); markCustom(); render(true); });
  }
  wireDial('demand', v => { state.params.demand = v; });
  wireDial('gas',    v => { state.params.gas = v; });
  wireDial('carbon', v => { state.params.carbon = v; });
  wireDial('wind',   v => { state.params.wind = v / 100; });
  wireDial('solar',  v => { state.params.solar = v / 100; });
  wireDial('depth',  v => { state.params.mustRunDepth = v; });

  /* ---- Conditions presets (data-preset="" = GB today reset) ---- */
  function applyCondition(key){
    closeCallout();
    state = {condition: key || null, params: paramsFor(key || null), adv: {}};
    syncControls();
    render(true);
  }
  for(const btn of document.querySelectorAll('#presets .chip[data-preset]')){
    btn.addEventListener('click', () => applyCondition(btn.dataset.preset));
  }

  /* ---- per-block edit callout ---- */
  let activeCallout = null;
  function closeCallout(){
    if(!activeCallout) return;
    const {pop, away} = activeCallout;
    activeCallout = null;
    document.removeEventListener('pointerdown', away, true);
    pop.remove();
  }
  function openCallout(name, el){
    closeCallout();
    const rect = el.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'mo-callout';
    pop.style.left = Math.round(Math.max(8, rect.left)) + 'px';
    pop.style.top = Math.round(rect.bottom + 6) + 'px';
    renderCalloutView(pop, name);
    document.body.appendChild(pop);
    const away = e => { if(!pop.contains(e.target)) closeCallout(); };
    document.addEventListener('pointerdown', away, true);
    activeCallout = {pop, away};
  }
  function renderCalloutView(pop, name){
    pop.textContent = '';
    const gen = currentStack().find(g => g.name === name);
    if(!gen) return;
    const pp = dispatch(currentStack(), state.params.demand).perPlant[name];

    const title = document.createElement('div');
    title.className = 'mo-callout-name';
    title.textContent = name;
    pop.appendChild(title);

    const installed = installedOf(name);
    const isVre = gen.family === 'wind' || gen.family === 'solar';
    const math = document.createElement('div');
    math.className = 'mo-callout-math';
    const availClause = (isVre && installed != null)
      ? `${fmtGW(gen.capacity)} GW available now (of ${fmtGW(installed)} GW installed) — `
      : `${fmtGW(gen.capacity)} GW at £${Math.round(gen.cost)}/MWh — `;
    math.textContent = availClause +
      `${fmtGW(pp.dispatchedMW)} GW dispatched, ${fmtGW(pp.strandedMW)} GW stranded, rent £${Math.round(pp.rent)}/h`;
    pop.appendChild(math);

    if(gen.storage){
      const note = document.createElement('div');
      note.className = 'mo-callout-note';
      note.textContent = 'Charging cost (what it paid to fill ÷ round-trip efficiency) — dispatched before gas; the shaded rent is the arbitrage spread it earns, not a fuel margin.';
      pop.appendChild(note);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button'; editBtn.className = 'btn';
    editBtn.textContent = 'Edit →';
    editBtn.addEventListener('click', () => renderCalloutEdit(pop, name));
    pop.appendChild(editBtn);
  }
  function stepperRow(label, read, unit, onStep){
    const row = document.createElement('div');
    row.className = 'mo-stepper';
    const lab = document.createElement('span');
    lab.className = 'mo-stepper-label'; lab.textContent = label;
    const minus = document.createElement('button');
    minus.type = 'button'; minus.className = 'mo-step-btn'; minus.textContent = '−';
    minus.setAttribute('aria-label', 'Decrease ' + label);
    const out = document.createElement('output');
    out.className = 'mo-stepper-out'; out.textContent = read() + unit;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'mo-step-btn'; plus.textContent = '+';
    plus.setAttribute('aria-label', 'Increase ' + label);
    minus.addEventListener('click', () => { onStep(-1); out.textContent = read() + unit; });
    plus.addEventListener('click', () => { onStep(1); out.textContent = read() + unit; });
    row.append(lab, minus, out, plus);
    return row;
  }
  /* edits commit into state.adv[name] = [cap, cost] (applied after buildStack) */
  function advOf(name){
    const g = currentStack().find(x => x.name === name);
    return state.adv[name] || [g.capacity, g.cost];
  }
  function renderCalloutEdit(pop, name){
    pop.textContent = '';
    const title = document.createElement('div');
    title.className = 'mo-callout-name';
    title.textContent = 'Edit ' + name;
    pop.appendChild(title);

    const CAP_STEP = 1, COST_STEP = 5;
    pop.appendChild(stepperRow('Capacity', () => Math.round(advOf(name)[0]), ' GW', dir => {
      const [cap, cost] = advOf(name);
      state.adv[name] = [clamp(cap + dir * CAP_STEP, 0, 90), cost];
      markCustom();
      render(true);
    }));
    pop.appendChild(stepperRow('Bid', () => Math.round(advOf(name)[1]), ' £/MWh', dir => {
      const [cap, cost] = advOf(name);
      state.adv[name] = [cap, clamp(cost + dir * COST_STEP, -200, 400)];
      markCustom();
      render(true);
    }));

    const done = document.createElement('button');
    done.type = 'button'; done.className = 'btn';
    done.textContent = 'Done';
    done.addEventListener('click', closeCallout);
    pop.appendChild(done);
  }
  chartwrap.addEventListener('click', e => {
    const g = e.target.closest && e.target.closest('g[data-plant]');
    if(g) openCallout(g.dataset.plant, g);
  });

  /* ---- FLIP + flash: settle-only, reduced-motion gated ---- */
  function measurePlantRects(){
    const map = new Map();
    for(const g of chartwrap.querySelectorAll('g[data-plant]')) map.set(g.dataset.plant, g.getBoundingClientRect());
    return map;
  }
  function flipAnimate(oldRects){
    for(const g of chartwrap.querySelectorAll('g[data-plant]')){
      const old = oldRects.get(g.dataset.plant);
      if(!old) continue;
      const now = g.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if(Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      g.style.transition = 'none';
      g.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        g.style.transition = '';
        g.style.transform = '';
        g.addEventListener('transitionend', () => { g.style.transition = ''; }, {once: true});
      }));
    }
  }
  function flashEl(el){
    if(!el) return;
    el.classList.remove('flash');
    void el.getBoundingClientRect();
    el.classList.add('flash');
  }

  /* ---- outputs / control sync ---- */
  function syncOutputs(){
    const p = state.params;
    $('demandout').textContent = fmtGW(p.demand) + ' GW';
    $('gasout').textContent = Math.round(p.gas) + 'p/therm';
    $('carbonout').textContent = '£' + Math.round(p.carbon) + '/t';
    $('windout').textContent = Math.round(p.wind * 100) + '%';
    $('solarout').textContent = Math.round(p.solar * 100) + '%';
    $('mustrunout').textContent = p.mustRunOn ? 'On' : 'Off';
    if(p.mustRunOn) $('depthout').textContent = '−£' + Math.round(p.mustRunDepth) + '/MWh';
  }
  function syncChips(){   // highlight the active Conditions chip (null = "GB today"; 'custom' = none)
    for(const b of document.querySelectorAll('#presets .chip[data-preset]')){
      const on = (b.dataset.preset || null) === (state.condition || null);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  function syncControls(){   // push params → slider positions + toggles (after a preset/boot)
    const p = state.params;
    $('demand').value = p.demand;
    $('gas').value = p.gas;
    $('carbon').value = p.carbon;
    $('wind').value = Math.round(p.wind * 100);
    $('solar').value = Math.round(p.solar * 100);
    $('depth').value = p.mustRunDepth;
    syncMustRunSeg(p.mustRunOn);
    $('depthctl').hidden = !p.mustRunOn;
    syncOutputs();
    syncChips();
  }

  /* ---- the refresh loop ---- */
  function render(settle){
    const animate = settle && !reducedMotion.matches;
    const oldRects = animate ? measurePlantRects() : null;

    const cs = currentState();
    const result = dispatch(cs.generators, cs.demand);
    const svg = renderStack(cs, {colors: themeColors(), measure, palette: palette()});
    lastSvg = svg;
    chartwrap.innerHTML = svg;
    chartwrap.appendChild(hitRect);
    positionHitRect();

    syncOutputs();
    syncChips();
    $('verdict').textContent = buildVerdict(result, cs);

    if(animate){
      if(oldRects) flipAnimate(oldRects);
      if(lastMarginalName !== undefined && result.marginalName !== lastMarginalName){
        flashEl(chartwrap.querySelector('g[data-plant="' + result.marginalName + '"]'));
      }
    }
    if(!settle && !reducedMotion.matches && !wasNegative && result.clearingPrice < 0){
      flashEl(chartwrap.querySelector('.negative-band'));
    }
    wasNegative = result.clearingPrice < 0;
    if(settle) lastMarginalName = result.marginalName;

    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState(encodeStateV2(state)), 400);
  }

  /* ---- exports ---- */
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copydoc')},
    getSvg: () => renderStack(currentState(), {colors: themeColors(), measure, palette: palette()}, {forExport: true}),
    getMarkdown: () => { const cs = currentState(); return toMarkdown(cs, dispatch(cs.generators, cs.demand)); },
    slug: () => 'merit-order',
  });

  /* ---- theme ---- */
  onThemeChange(() => render(false));

  /* ---- boot: URL state (v2), else GB-today defaults ---- */
  const restored = decodeStateV2(readHashState());
  if(restored){
    state = {condition: restored.condition,
             params: {...DEFAULT_PARAMS, ...restored.params},
             adv: restored.adv || {}};
  }
  syncControls();
  render(true);
}
