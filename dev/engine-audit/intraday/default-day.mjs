// F-ID-5 analysis (no engine change): today's default day against a winter and a summer candidate.
// Run: node dev/engine-audit/intraday/default-day.mjs [fleetH]
// Generic GB-shaped parameters, not real data. Only the day's own sliders differ; gas, carbon, wind,
// round-trip efficiency and the fixed demand shape are held at the tool's defaults.
import {runDay, DAY_DEFAULTS} from '../../../energy/intraday/day.js';
import {buildDayVerdictParts} from '../../../energy/intraday/render-day.js';

const fleetH = Number(process.argv[2] || 2);
const DAYS = {
  'today default (summer trough, winter peak, 16 h sun)': {...DAY_DEFAULTS},
  'winter weekday': {...DAY_DEFAULTS, trough: 28, peak: 45, solarPeak: 2, sunrise: 8, sunset: 16},
  'summer weekday': {...DAY_DEFAULTS, trough: 21, peak: 32, solarPeak: 9, sunrise: 5, sunset: 21},
  'extra: winter weekday, windy (wind 60%, not asked for)': {...DAY_DEFAULTS, trough: 28, peak: 45, solarPeak: 2, sunrise: 8, sunset: 16, wind: 0.6},
};
const FLEETS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12];

for(const [name, base] of Object.entries(DAYS)){
  const raw = runDay({...base, fleetGW: 0, fleetH}).raw;
  const lo = Math.min(...raw.prices), hi = Math.max(...raw.prices);
  console.log(`\n## ${name}: trough ${base.trough} GW, peak ${base.peak} GW, solar ${base.solarPeak} GW ${base.sunrise}:00-${base.sunset}:00, fleet ${fleetH} h`);
  console.log(`day price shape: low £${lo.toFixed(1)} (${raw.prices.indexOf(lo)}:00)  high £${hi.toFixed(1)} (${raw.prices.indexOf(hi)}:00)  spread £${raw.spread.toFixed(1)}`);
  console.log('hourly £/MWh: ' + raw.prices.map(x => Math.round(x)).join(' '));
  console.log('fleet GW | trades kept | GWh out | total £k/day | £/MW/day | planned £/MW | tank | verdict');
  let best = {t: -1, g: 0}, prev = 0, fell = null;
  for(const g of FLEETS){
    const p = {...base, fleetGW: g, fleetH}, r = runDay(p), v = buildDayVerdictParts(r, p).line;
    const perGW = g ? r.achievedMargin / g : 0, planned = g ? r.plannedMargin / g : 0;
    const tank = (v.match(/only paid for (\d+)% of the tank/) || [])[1];
    if(r.achievedMargin > best.t){ best = {t: r.achievedMargin, g}; }
    if(g && r.achievedMargin < prev - 1e-9 && fell == null) fell = g;
    prev = r.achievedMargin;
    console.log(`${String(g).padStart(8)} | ${String(r.book.length).padStart(11)} | ${r.dischargedGWh.toFixed(2).padStart(7)} | ${r.achievedMargin.toFixed(0).padStart(12)} | ${perGW.toFixed(0).padStart(8)} | ${planned.toFixed(0).padStart(12)} | ${(tank ? tank + '%' : '-').padStart(4)} | ${v}`);
  }
  console.log(`total earnings peak at ${best.g} GW (£${best.t.toFixed(0)}k/day); first fleet where total falls vs the previous row: ${fell ?? 'none in range'}`);
}
