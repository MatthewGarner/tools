import {parse} from '../../bets/parse.js';
import {simulate} from '../../bets/engine.js';
import {renderBoard} from '../../bets/render.js';
import {renderQuadrant} from '../../bets/render-quadrant.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading portfolio\nunit: £k\nGrowth bets\n  Referral flow: stake 80, odds 40-60%, payoff 300-500\n    kill: Signups per referral stay under 0.3\n  Paid acquisition: stake 220, odds 15-25%, payoff 150-300\nPlatform bets\n  Sync engine: stake 150, odds 90-98%, payoff 180-260';
const v1=sourceDefinition({id:'bets',title:'Bets',description:'An editable, authored example using the native model and renderer.',source,extraState:{v:'board'},extraSchema:{v:choice(['board','quadrant'])},controls:{view:{label:'View',type:'select',path:['v'],options:[{value:'board',label:'Portfolio board'},{value:'quadrant',label:'Stake and return'}]}},
  validate(s){const m=boundedModel(parse(s.t));if(m.groups.reduce((n,g)=>n+g.bets.length,0)>20)throw new Error('Article portfolios support at most 20 bets.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source','view'],render(s,ctx){const m=parse(s.t),c=context(ctx);const r=simulate(m);return {svg:(s.v==='board'?renderBoard:renderQuadrant)(m,r,c),summary:sourceSummary('Bets',m,'Portfolio stakes, success odds and conditional payoffs. Simulated outcomes follow these assumptions and the fixed native seed.')} ;}}}
});
// Version 2: 40,000 runs on an unconditional draw order, figures printed to what the runs support, a split median where the runs cannot pin it, authored inputs shown as written. Version 1 stays frozen as published.
// Version 3: the 2026-11-14 feel and export round (shared drawing, export and workspace code).
export const definition={...v1,version:3};
