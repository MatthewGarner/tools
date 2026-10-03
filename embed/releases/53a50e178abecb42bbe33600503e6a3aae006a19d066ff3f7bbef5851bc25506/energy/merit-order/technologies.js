/* GB-2026 technology catalogue for the merit-order tool. Installed capacities are
   representative structural figures (DUKES 2025 / NESO / RenewableUK / Modo Energy),
   NOT live data. `family` maps to a validated chart hue (render.js). Pure data. */
export const FAMILIES = ['wind','solar','nuclear','biomass','thermal','storage','imports','other','ccs','hydrogen'];

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

/* NESO FES 2025 "Pathways to Net Zero" — installed capacity (GW) at 2035. Same technology
   keys as GB_TODAY (2035 capacities) plus two net-zero block types: gas-CCS (carbon-reactive,
   `kind:'ccs'`) and hydrogen-fired (fixed £200 zero-carbon backstop). `thermalHue:true` tints
   them from the thermal ramp (render.js) while keeping their own family for labelling. hydro
   and waste are held at GB-today values (FES doesn't break them out — a stated simplification).
   Zero-capacity techs are kept (buildStack/render skip capacity<=0), so FB carries hydrogen:0. */
function fesWorld({wind, solar, nuclear, ccgt, ocgt, ccs, hydrogen, bess, pumped, imports, biomass}){
  return [
    {key:'wind',    label:'Wind',           family:'wind',    installed:wind,    bid:{kind:'vre'}, vre:true},
    {key:'solar',   label:'Solar',          family:'solar',   installed:solar,   bid:{kind:'vre'}, vre:true},
    {key:'hydro',   label:'Hydro',          family:'other',   installed:1.9,     bid:{kind:'fixed', cost:3}},
    {key:'nuclear', label:'Nuclear',        family:'nuclear', installed:nuclear, bid:{kind:'fixed', cost:5}, mustRun:true},
    {key:'waste',   label:'Waste/CHP',      family:'other',   installed:4.5,     bid:{kind:'fixed', cost:20}, mustRun:true},
    {key:'bess',    label:'BESS',           family:'storage', installed:bess,    bid:{kind:'storage', rte:0.85}},
    {key:'pumped',  label:'Pumped storage', family:'storage', installed:pumped,  bid:{kind:'storage', rte:0.75}},
    {key:'biomass', label:'Biomass',        family:'biomass', installed:biomass, bid:{kind:'fixed', cost:75}},
    {key:'imports', label:'Imports',        family:'imports', installed:imports, bid:{kind:'imports', price:80}},
    {key:'gasCCGT', label:'CCGT',           family:'thermal', installed:ccgt,    bid:{kind:'gas', vom:3, bands:[
      {label:'CCGT 60%', eff:0.60, share:0.20}, {label:'CCGT 54%', eff:0.54, share:0.50}, {label:'CCGT 49%', eff:0.49, share:0.30}]}},
    {key:'gasCCS',  label:'Gas-CCS',        family:'ccs',     installed:ccs,     bid:{kind:'ccs'}, thermalHue:true},
    {key:'gasOCGT', label:'OCGT',           family:'thermal', installed:ocgt,    bid:{kind:'gas', vom:6, bands:[
      {label:'OCGT 42%', eff:0.42, share:0.60}, {label:'OCGT 36%', eff:0.36, share:0.40}]}},
    {key:'hydrogen',label:'Hydrogen',       family:'hydrogen',installed:hydrogen,bid:{kind:'fixed', cost:200}, thermalHue:true},
  ];
}
export const FES_HT = fesWorld({wind:124, solar:62, nuclear:5.0, ccgt:11.5, ocgt:3.2,  ccs:8.1, hydrogen:2.6, bess:30, pumped:10.5, imports:19, biomass:3.7});
export const FES_EE = fesWorld({wind:107, solar:62, nuclear:5.5, ccgt:12.7, ocgt:7.3,  ccs:7.2, hydrogen:1.0, bess:33, pumped:8.6,  imports:21, biomass:5.4});
export const FES_HE = fesWorld({wind:113, solar:56, nuclear:5.0, ccgt:15.7, ocgt:8.1,  ccs:9.5, hydrogen:7.1, bess:25, pumped:7.5,  imports:18, biomass:2.5});
export const FES_FB = fesWorld({wind:87,  solar:41, nuclear:4.6, ccgt:33.1, ocgt:14.9, ccs:3.2, hydrogen:0,   bess:23, pumped:3.2,  imports:13, biomass:5.1});
