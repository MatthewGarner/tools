import {parse} from '../../roadmap/parse.js';
import {renderChapter} from '../../roadmap/chapter-svg.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading roadmap\nheadline: Make returning to a book easier\ndate: 2026-10-03\nstyle: grid\nNOW\nCore: Resume position [doing]\nCore: Curated shelves [bet: shelves]\nNEXT\nGrowth: Share a shelf [if shelves]\nGrowth: Reading digest [unless shelves]\nLATER\nPlatform: Offline reading';
const v1=sourceDefinition({id:'roadmap',title:'Roadmap',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);return {svg:renderChapter(m,c),summary:sourceSummary('Roadmap',m,(m.title||'Delivery work')+': work grouped by its authored horizons; conditional items retain their bet context.')} ;}}}
});
// Version 3: a slide fits when its ink does, in every view (Board, Grid and Register as Focus), so slide sets take the room the gap after the last card used to hold.
// Versions 1 and 2 stay frozen as published.
// Version 4: the 2026-11-14 feel and export round (shared drawing, export and workspace code).
export const definition={...v1,version:4};
