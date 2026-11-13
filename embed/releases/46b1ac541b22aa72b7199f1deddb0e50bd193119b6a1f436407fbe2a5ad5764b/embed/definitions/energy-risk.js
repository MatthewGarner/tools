import {parse} from '../../energy/risk/parse.js';
import {simulate} from '../../energy/risk/engine.js';
import {render,riskVerdict} from '../../energy/risk/render.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Route to market\nmerchant: 60..180\nfloor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
const v1=sourceDefinition({id:'energy-risk',title:'Risk transfer',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));if(!m.merchant)throw new Error('Supply a merchant revenue range.');if(s.t.split('\n').length>20)throw new Error('Keep article risk comparisons under 20 lines.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);const sim=simulate(m);return {svg:render(m,sim,c,{edit:false}),summary:sourceSummary('Risk transfer',m,riskVerdict(sim,m)+' Exact quantile grid, assumed merchant revenue distribution.')} ;}}}
});
// Version 2 (2026-11-12 engine audit): Risk figures are exact (quantile grid, no sampling error), a toll with a fee beats merchant at T minus fee, "bad year (P10)" replaces "worst-year". Version 1 stays frozen as published.
// Version 3: the 2026-11-14 feel and export round (shared drawing, export and workspace code).
export const definition={...v1,version:3};
