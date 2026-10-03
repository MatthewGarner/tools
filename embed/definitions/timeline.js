import {parse} from '../../timeline/parse.js';
import {render,timelineVerdict} from '../../timeline/render.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading app launch\ntoday: 2026-10-03\nstyle: field\nApp: Beta cut 2026-10-19 .. 2026-11-02\nAssurance: Privacy audit 2026-10-12 .. 2026-11-23\nLaunch: Campaign ready 2026-11-02 .. 2026-11-16\nLaunch: Conference 2026-12-15 [fixed]';
export const definition=sourceDefinition({id:'timeline',title:'Timeline',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));if(m.items.length>30)throw new Error('Article timelines support at most 30 items.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);c.today=Math.floor(Date.parse(c.today)/86400000);return {svg:render(m,c,null,{edit:false,intent:c.width<600?'live-narrow':'live-wide'}),summary:sourceSummary('Timeline',m,timelineVerdict(m,c.today).line+' Forecast intervals are supplied estimates.')} ;}}}
});
