import {parse} from '../../roadmap/parse.js';
import {renderChapter} from '../../roadmap/chapter-svg.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading roadmap\nheadline: Make returning to a book easier\ndate: 2026-10-03\nstyle: grid\nNOW\nCore: Resume position [doing]\nCore: Curated shelves [bet: shelves]\nNEXT\nGrowth: Share a shelf [if shelves]\nGrowth: Reading digest [unless shelves]\nLATER\nPlatform: Offline reading';
export const definition=sourceDefinition({id:'roadmap',title:'Roadmap',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);return {svg:renderChapter(m,c),summary:sourceSummary('Roadmap',m,(m.title||'Delivery work')+': work grouped by its authored horizons; conditional items retain their bet context.')} ;}}}
});
