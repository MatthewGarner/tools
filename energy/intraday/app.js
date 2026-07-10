// energy/intraday/app.js
/* DOM shell: sliders/presets → runDay() → stack SVG (merit-order's renderStack
   at the scrubbed hour) + price-shape SVG + verdict + exports + hash state.
   All engine/render work is pure and lives in day.js / render-day.js.

   Adaptations from the task-7 brief (verified against the real consumers/contracts):
   - wireExports takes {buttons, getSvg, getMarkdown, slug} (assets/exports.js),
     not {svg, name, buttons} — the brief's shape doesn't exist.
   - renderStack (and renderDay) call ctx.measure unconditionally while sizing the
     export-verdict wrap band, even on-screen — passing app-common's `measure` is
     required, not optional; omitting it throws "ctx.measure is not a function".
   - Width-aware narrow rendering (renderWidth()/ResizeObserver bucket-flip) added
     to both panels, matching merit-order/cycles/risk's established pattern — the
     brief hardcoded width:900 with a CSS-only pan fallback, but render-day.js's
     own narrow branch (isNarrow < 520, exercised by its tests at width 360) is
     otherwise never reached in production. */
import {runDay, hourStack, DAY_DEFAULTS} from './day.js';
import {renderDay, buildDayVerdict} from './render-day.js';
import {renderStack, MERIT_PALETTE} from '../merit-order/render.js';
import {encodeDayState, decodeDayState} from './state.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange, isDark} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';

export const PRESETS = {
  winter:    {label: 'Winter weekday',      mutate: {trough: 30, peak: 47, solarPeak: 2, sunrise: 8, sunset: 16}},
  summerSun: {label: 'Sunny summer Sunday', mutate: {trough: 24, peak: 35, solarPeak: 10, sunrise: 5, sunset: 21}},
  gasSpike:  {label: 'Gas spike',           mutate: {gas: 250}},
  bigFleet:  {label: 'Big fleet',           mutate: {fleetGW: 10, fleetH: 2}},
};

if(typeof document !== 'undefined') boot();

function boot(){
  const $ = id => document.getElementById(id);
  const SLIDERS = ['trough', 'peak', 'solarPeak', 'gas', 'carbon', 'fleetGW', 'fleetH'];
  const DECIMAL = new Set(['fleetGW', 'fleetH']);   // half-GW/half-hour steps read as one decimal
  let p = {...DAY_DEFAULTS}, preset = null, hour = 18, result = null;
  let hashTimer = null, lastPriceSvg = '', lastStackSvg = '';

  const restored = decodeDayState(readHashState());
  if(restored){
    p = restored.p;
    // guard a stale/hostile preset key surviving from an older PRESETS shape
    preset = PRESETS[restored.preset] ? restored.preset : null;
  }

  const palette = () => MERIT_PALETTE[isDark() ? 'dark' : 'light'];

  /* ---- narrow-render width: measure each panel, mirroring cycles/risk/merit-order.
     Both renderers require an explicit width (no built-in default that matches
     this page's 900 canonical), so — unlike merit-order's `undefined ⇒ 1200` —
     this always returns a concrete number. ---- */
  const NARROW = 520;
  const priceEl = $('pricewrap'), stackEl = $('stackwrap');
  const renderWidth = el => { const w = el.clientWidth; return (w && w < NARROW) ? w : 900; };

  function refresh(){
    result = runDay(p);
    const colors = themeColors();

    const priceW = renderWidth(priceEl);
    // draw-as-you-play (spec G1): while Play is running the curve draws itself
    // point-by-point up to the current hour; scrubbing (not playing) and the
    // forExport call below keep the full day + moving cursor as before.
    const priceSvg = renderDay(result, p,
      {width: priceW, height: 420, colors, palette: palette(), measure},
      playing ? {cursor: hour, upTo: hour} : {cursor: hour});
    priceEl.classList.toggle('narrow', priceW < NARROW);
    if(priceSvg !== lastPriceSvg){ priceEl.innerHTML = priceSvg; lastPriceSvg = priceSvg; }

    const net = result.flat.hours[hour].demand;
    const stackW = renderWidth(stackEl);
    const stackSvg = renderStack({generators: hourStack(p, hour), demand: net},
      {width: stackW, colors, palette: palette(), measure},
      {labelCollide: 'drop'});   // opt-in: sansStorage leaves Waste/CHP·Biomass·Imports contiguous and thin — suppress colliding axis labels (wider run wins)
    stackEl.classList.toggle('narrow', stackW < NARROW);
    if(stackSvg !== lastStackSvg){ stackEl.innerHTML = stackSvg; lastStackSvg = stackSvg; }

    $('verdict').textContent = buildDayVerdict(result, p);
    $('clock').textContent = String(hour).padStart(2, '0') + ':00';
    for(const id of SLIDERS){
      $(id).value = p[id];
      $(id).nextElementSibling.textContent = DECIMAL.has(id) ? p[id].toFixed(1) : String(p[id]);
    }
    syncChips();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState(encodeDayState(p, preset)), 400);
  }

  function syncChips(){
    for(const b of document.querySelectorAll('#presets [data-preset]'))
      b.classList.toggle('on', b.dataset.preset === preset);
  }

  for(const id of SLIDERS) $(id).addEventListener('input', () => {
    p = {...p, [id]: Number($(id).value)}; preset = null; refresh();
  });
  document.querySelectorAll('#presets [data-preset]').forEach(b => b.addEventListener('click', () => {
    preset = b.dataset.preset;
    p = {...DAY_DEFAULTS, ...PRESETS[preset].mutate};
    refresh();
  }));
  $('scrub').addEventListener('input', () => { hour = Number($('scrub').value); refresh(); });

  /* ---- play: one hour per ~450 ms via rAF; hidden under prefers-reduced-motion (CSS).
     tick() allocates nothing itself — only refresh()'s render calls do. lastTick
     starts null and is seeded from the first real rAF timestamp (not 0 — ts is
     time-since-navigation, so comparing against 0 made the very first frame after
     pressing Play almost always already >450ms "late" and fire an instant extra
     advance before any real animation time had passed). */
  let playing = false, lastTick = null;
  function setPlayLabel(){
    $('play').textContent = playing ? '⏸ Pause' : '▶ Play the day';
    $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play the day');
  }
  function tick(ts){
    if(!playing) return;
    if(lastTick === null) lastTick = ts;
    if(ts - lastTick >= 450){
      lastTick = ts; hour = (hour + 1) % 24; $('scrub').value = hour; refresh();
      if(hour === 23){ playing = false; setPlayLabel(); return; }
    }
    requestAnimationFrame(tick);
  }
  $('play').addEventListener('click', () => {
    playing = !playing;
    setPlayLabel();
    if(playing){
      // render hour 0 immediately — otherwise the first visible frame was
      // 01:00 after the first 450ms tick, i.e. Play appeared to do nothing
      hour = 0; $('scrub').value = hour; lastTick = null; refresh();
      requestAnimationFrame(tick);
    }
  });

  wireExports({
    getSvg: () => renderDay(result, p,
      {width: 900, height: 420, colors: themeColors(), palette: palette(), measure,
       today: new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})},
      {forExport: true}),
    slug: () => 'intraday',
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  });
  onThemeChange(refresh);

  /* ---- narrow-bucket resize: re-render only when either panel's bucket flips ---- */
  let lastBucket = null;
  const ro = new ResizeObserver(() => {
    const w = priceEl.clientWidth;
    const bucket = (w && w < NARROW) ? 'narrow' : 'wide';
    if(bucket === lastBucket) return;
    lastBucket = bucket;
    refresh();
  });
  ro.observe(priceEl, {box: 'content-box'});

  refresh();
}
