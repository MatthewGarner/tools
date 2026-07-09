/* GB-2026 technology catalogue for the merit-order tool. Installed capacities are
   representative structural figures (DUKES 2025 / NESO / RenewableUK / Modo Energy),
   NOT live data. `family` maps to a validated chart hue (render.js). Pure data. */
export const FAMILIES = ['wind','solar','nuclear','biomass','thermal','storage','imports','other'];

export const GB_TODAY = [
  {key:'wind',    label:'Wind',           family:'wind',    installed:32,   bid:{kind:'vre'},              vre:true},
  {key:'solar',   label:'Solar',          family:'solar',   installed:22,   bid:{kind:'vre'},              vre:true},
  {key:'hydro',   label:'Hydro',          family:'other',   installed:1.9,  bid:{kind:'fixed', cost:3}},
  {key:'nuclear', label:'Nuclear',        family:'nuclear', installed:6,    bid:{kind:'fixed', cost:5},    mustRun:true},
  {key:'waste',   label:'Waste/CHP',      family:'other',   installed:4.5,  bid:{kind:'fixed', cost:20},   mustRun:true},
  {key:'bess',    label:'BESS',           family:'storage', installed:7.2,  bid:{kind:'storage', rte:0.85}},
  {key:'pumped',  label:'Pumped storage', family:'storage', installed:2.8,  bid:{kind:'storage', rte:0.75}},
  {key:'biomass', label:'Biomass',        family:'biomass', installed:4,    bid:{kind:'fixed', cost:75}},
  {key:'imports', label:'Imports',        family:'imports', installed:10.3, bid:{kind:'imports', price:80}},
  {key:'gasCCGT', label:'CCGT',           family:'thermal', installed:31,   bid:{kind:'gas', vom:3, bands:[
    {label:'CCGT 60%', eff:0.60, share:0.20},
    {label:'CCGT 54%', eff:0.54, share:0.50},
    {label:'CCGT 49%', eff:0.49, share:0.30},
  ]}},
  {key:'gasOCGT', label:'OCGT',           family:'thermal', installed:2.5,  bid:{kind:'gas', vom:6, bands:[
    {label:'OCGT 42%', eff:0.42, share:0.60},
    {label:'OCGT 36%', eff:0.36, share:0.40},
  ]}},
];
