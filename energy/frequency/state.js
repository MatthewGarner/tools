// energy/frequency/state.js — pure control→params mapping + presets (no DOM)
export const PRESETS = {
  grid2010: {inertia: 250, trip: 1.0, dc: 0, dcspeed: 0.5, gfm: 0},
  grid2030: {inertia: 90,  trip: 1.8, dc: 0, dcspeed: 0.5, gfm: 0},
  rescue:   {inertia: 90,  trip: 1.8, dc: 1.2, dcspeed: 0.4, gfm: 20},
  gfmduel:  {inertia: 90,  trip: 1.8, dc: 1.0, dcspeed: 0.4, gfm: 20},
};

export function paramsFromControls(v){
  return {
    eSync: v.inertia, trip: v.trip,
    dcMw: v.dc, dcDelay: v.dcspeed, eGfm: v.gfm,
    battMW: Math.max(1, v.dc),   // DC volume proxies battery MW rating (caps GFM inertia)
    load: 30,
  };
}
