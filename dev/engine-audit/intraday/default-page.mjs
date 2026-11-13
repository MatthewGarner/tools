// What the Intraday page prints on opening: the earlier default day against the summer weekday, at three fleet sizes.
// Run: node dev/engine-audit/intraday/default-page.mjs
import {runDay, DAY_DEFAULTS, dayLabel} from '../../../energy/intraday/day.js';
import {buildDayVerdictParts} from '../../../energy/intraday/render-day.js';

const OLD = {...DAY_DEFAULTS, trough: 22, peak: 44, solarPeak: 6};
const at = h => String(h).padStart(2, '0') + ':00';
for(const [name, base, label] of [['EARLIER default', OLD, 'Custom day'], ['SUMMER WEEKDAY default', DAY_DEFAULTS, dayLabel(DAY_DEFAULTS)]]){
  console.log(`\n## ${name} (day label: ${label}) trough ${base.trough} peak ${base.peak} solar ${base.solarPeak} GW ${base.sunrise}-${base.sunset}`);
  for(const g of [0, 2, 6]){
    const p = {...base, fleetGW: g}, r = runDay(p), v = buildDayVerdictParts(r, p);
    const cap = p.fleetGW * p.fleetH, peakSoc = Math.max(...r.sched.soc);
    console.log(`fleet ${g} GW x ${p.fleetH} h`);
    console.log(`  metrics: ${label} | 24 hours | ${g > 0 ? `${g} GW × ${p.fleetH} h fleet` : 'no storage fleet'} | raw spread £${Math.round(r.raw.spread)}`);
    console.log(`  chart: spread £${Math.round(r.raw.spread)} · trough ${at(r.raw.troughHour)} · peak ${at(r.raw.peakHour)}; day prices £${Math.min(...r.raw.prices).toFixed(0)}-£${Math.max(...r.raw.prices).toFixed(0)}`);
    if(g > 0) console.log(`  flattened spread £${Math.round(r.flat.spread)}; SoC label: peak ${peakSoc.toFixed(1)} of ${cap} GWh - ${Math.round(100 * peakSoc / cap)}% of the tank; earned £${Math.round(r.achievedMargin)}k/day (£${Math.round(r.achievedMargin / g)}/MW/day) of planned £${Math.round(r.plannedMargin / g)}/MW; kept GWh ${r.dischargedGWh.toFixed(2)}`);
    console.log(`  verdict: ${v.line}`);
    console.log(`  fig: ${v.fig}`);
  }
}
