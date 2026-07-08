// energy/merit-order/app.js
/* DOM shell: dials/drag/edit → dispatch() → SVG stack + verdict + exports.
   Engine/state/render are pure; the DOM lives only here. */
import {dispatch} from './engine.js';
import {renderStack, toMarkdown, buildVerdict} from './render.js';
import {PRESETS, generatorsFromPreset, setRenewShare, setGasPrice, setMustRun,
  encodeState, decodeState} from './state.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';

if (typeof document !== 'undefined') boot();

function boot(){
  const $ = id => document.getElementById(id);
  const chartwrap = $('chartwrap');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fmtGW = v => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');

  /* ---- chart geometry the drag math needs, mirrored from render.js ----
     x0/x1 are fixed (the plot area's left/right edge in SVG user-units);
     maxX (the GW-domain the plot spans) is data-dependent, same formula
     render.js uses for its own sx() scale. Keep these two files in sync if
     the chart's layout ever changes (noted as a shared-code candidate). */
  const CHART_X0 = 116, CHART_X1 = 1200 - 32;
  function chartDomainMax(){
    const totalCapacity = state.generators.reduce((s, g) => s + g.capacity, 0);
    return Math.max(totalCapacity, state.demand, 1) * 1.04;
  }

  /* ---- state: the 4 generators (archetype order) + demand ---- */
  let state;
  let lastSvg = '', hashTimer = null;
  let wasNegative = false, lastMarginalName;   // lastMarginalName starts undefined: no flash on boot
  let dragging = false;

  /* ---- demand-drag hit-rect: one persistent DOM node, re-parented into
     chartwrap after every innerHTML swap (appendChild on a detached node
     keeps its listeners — the swap only destroys the *previous* node's
     subtree, not this one, since it's re-attached, not re-created). ---- */
  const hitRect = document.createElement('div');
  hitRect.className = 'demand-hit';
  hitRect.setAttribute('aria-hidden', 'true');   // #demand slider is the accessible control
  hitRect.addEventListener('pointerdown', e => {
    e.preventDefault();
    dragging = true;
  });

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
    if(!svgEl || !svgEl.createSVGPoint) return state.demand;
    const ctm = svgEl.getScreenCTM();
    if(!ctm) return state.demand;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    const p = pt.matrixTransform(ctm.inverse());
    const gw = ((p.x - CHART_X0) / (CHART_X1 - CHART_X0)) * chartDomainMax();
    return Math.max(0, Math.min(55, gw));
  }

  /* snap to the exact cumulative-capacity boundary (marginal-flip point)
     when within 0.5 GW, so the knife-edge lands on the true value */
  function snapDemand(gw){
    const result = dispatch(state.generators, state.demand);
    let running = 0;
    const bounds = [0];
    for(const g of result.sorted){ running += g.capacity; bounds.push(running); }
    let snapped = null, best = 0.5;
    for(const b of bounds){
      const d = Math.abs(gw - b);
      if(d <= best){ snapped = b; best = d; }
    }
    return snapped !== null ? snapped : Math.round(gw * 10) / 10;
  }

  window.addEventListener('pointermove', e => {
    if(!dragging) return;
    state.demand = snapDemand(clientXToGW(e.clientX));
    render(false);
  });
  window.addEventListener('pointerup', () => {
    if(!dragging) return;
    dragging = false;
    render(true);
  });

  /* ---- must-run segmented toggle: role=radio + aria-checked (Task 4 review flag) ---- */
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
    setMustRun(state.generators, on, +$('depth').value);
    syncMustRunSeg(on);
    $('depthctl').hidden = !on;
    closeCallout();
    render(true);
  }));

  /* ---- dials: renew/gas/demand/depth — input live cut, change settles ---- */
  function wireDial(id, apply){
    const el = $(id);
    el.addEventListener('input', () => { apply(+el.value); render(false); });
    el.addEventListener('change', () => { apply(+el.value); render(true); });
  }
  wireDial('demand', v => { state.demand = v; });
  wireDial('renew', v => setRenewShare(state.generators, v));
  wireDial('gas', v => setGasPrice(state.generators, v));
  wireDial('depth', v => {
    const renewables = state.generators.find(g => g.name === 'Renewables');
    if(renewables.mustRun) setMustRun(state.generators, true, v);
  });

  /* ---- presets ---- */
  function applyPreset(key){
    const P = PRESETS[key];
    if(!P) return;
    closeCallout();
    state = {generators: generatorsFromPreset(P), demand: P.demand};
    $('demand').value = P.demand;
    $('renew').value = P.renew;
    $('gas').value = P.gas;
    $('depth').value = P.depth;
    syncMustRunSeg(P.mustRun);
    $('depthctl').hidden = !P.mustRun;
    render(true);
  }
  for(const btn of document.querySelectorAll('#presets .chip[data-preset]')){
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  }

  /* ---- per-plant edit callout: tap a bar for arithmetic + "Edit ->";
     Edit opens +/- steppers (never a bare number input) for capacity/cost,
     plus a must-run toggle for Renewables. Lives in document.body (survives
     chart re-renders); dismissed on outside click or a preset/URL reload. ---- */
  let activeCallout = null;   // {pop}
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
    const gen = state.generators.find(g => g.name === name);
    const pp = dispatch(state.generators, state.demand).perPlant[name];

    const title = document.createElement('div');
    title.className = 'mo-callout-name';
    title.textContent = name;
    pop.appendChild(title);

    const math = document.createElement('div');
    math.className = 'mo-callout-math';
    math.textContent = `${fmtGW(gen.capacity)} GW at £${Math.round(gen.cost)}/MWh — ` +
      `${fmtGW(pp.dispatchedMW)} GW dispatched, ${fmtGW(pp.strandedMW)} GW stranded, rent £${Math.round(pp.rent)}/h`;
    pop.appendChild(math);

    if(gen.mustRun && pp.strandedMW > 0){
      const note = document.createElement('div');
      note.className = 'mo-callout-note';
      note.textContent = `${fmtGW(pp.strandedMW)} GW would generate anyway — curtailed or exported, simplified away here.`;
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
  function renderCalloutEdit(pop, name){
    pop.textContent = '';
    const gen = state.generators.find(g => g.name === name);
    const title = document.createElement('div');
    title.className = 'mo-callout-name';
    title.textContent = 'Edit ' + name;
    pop.appendChild(title);

    const CAP_STEP = 1, COST_STEP = 5;   // matches the #renew/#gas slider step sizes
    pop.appendChild(stepperRow('Capacity', () => Math.round(gen.capacity), ' GW', dir => {
      gen.capacity = Math.max(0, Math.min(80, gen.capacity + dir * CAP_STEP));
      render(true);
    }));
    pop.appendChild(stepperRow('Cost', () => Math.round(gen.cost), ' £/MWh', dir => {
      gen.cost = Math.max(-200, Math.min(400, gen.cost + dir * COST_STEP));
      render(true);
    }));

    if(name === 'Renewables'){   // mustRun is Renewables-specific in state.js's model
      const row = document.createElement('div');
      row.className = 'mo-stepper';
      const lab = document.createElement('span');
      lab.className = 'mo-stepper-label'; lab.textContent = 'Must-run';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'chip';
      btn.textContent = gen.mustRun ? 'On' : 'Off';
      btn.addEventListener('click', () => {
        const on = !gen.mustRun;
        setMustRun(state.generators, on, +$('depth').value);
        syncMustRunSeg(on);
        $('depthctl').hidden = !on;
        btn.textContent = on ? 'On' : 'Off';
        render(true);
      });
      row.append(lab, btn);
      pop.appendChild(row);
    }

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
    void el.getBoundingClientRect();   // force reflow so re-adding restarts the animation
    el.classList.add('flash');
  }

  /* ---- the refresh loop ---- */
  function syncOutputs(){
    const renewables = state.generators.find(g => g.name === 'Renewables');
    const ccgt = state.generators.find(g => g.name === 'CCGT');
    $('demand').value = state.demand;
    $('demandout').textContent = fmtGW(state.demand) + ' GW';
    $('renew').value = renewables.capacity;
    $('renewout').textContent = fmtGW(renewables.capacity) + ' GW';
    $('gas').value = Math.round(ccgt.cost);
    $('gasout').textContent = '£' + Math.round(ccgt.cost) + '/MWh';
    $('mustrunout').textContent = renewables.mustRun ? 'On' : 'Off';
    if(renewables.mustRun){
      const depth = Math.max(0, -renewables.cost);
      $('depth').value = depth;
      $('depthout').textContent = '−£' + Math.round(depth) + '/MWh';
    }
  }

  function render(settle){
    const animate = settle && !reducedMotion.matches;
    const oldRects = animate ? measurePlantRects() : null;

    const result = dispatch(state.generators, state.demand);
    const svg = renderStack(state, {colors: themeColors(), measure});
    lastSvg = svg;
    chartwrap.innerHTML = svg;
    chartwrap.appendChild(hitRect);
    positionHitRect();

    syncOutputs();
    $('verdict').textContent = buildVerdict(result, state);

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
    lastMarginalName = result.marginalName;

    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState(encodeState(state.generators, state.demand)), 400);
  }

  /* ---- exports ---- */
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copydoc')},
    getSvg: () => lastSvg,
    getMarkdown: () => toMarkdown(state, dispatch(state.generators, state.demand)),
    slug: () => 'merit-order',
  });

  /* ---- theme ---- */
  onThemeChange(() => render(false));

  /* ---- boot: URL state, else the typical-day preset ---- */
  const restored = decodeState(readHashState());
  state = restored ?? {generators: generatorsFromPreset(PRESETS.typical), demand: PRESETS.typical.demand};
  {
    const renewables = state.generators.find(g => g.name === 'Renewables');
    $('demand').value = state.demand;
    $('renew').value = renewables.capacity;
    $('gas').value = state.generators.find(g => g.name === 'CCGT').cost;
    if(renewables.mustRun) $('depth').value = Math.max(0, -renewables.cost);
    syncMustRunSeg(renewables.mustRun);
    $('depthctl').hidden = !renewables.mustRun;
  }
  render(true);
}
