import {parse} from '../../wardley/parse.js';
import {layoutMap} from '../../wardley/layout.js';
import {renderMap,GEOM} from '../../wardley/render.js';
import {sourceDefinition,context,sourceSummary} from './classic-shared.js';
const source=`title: A reading service
anchor: Reader
Discover a book @ product
Recommendations @ custom
Catalogue @ commodity
Hosting @ commodity
Reader -> Discover a book -> Recommendations -> Catalogue -> Hosting`;
export const definition=sourceDefinition({id:'wardley',title:'Wardley map',description:'An authored value chain and its evolution.',source,
  views:{map:{title:'Strategic field',description:'The native evolution map, with a phone reading layout.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx),intent=c.width<520?'live-narrow':'live-wide',layout=layoutMap(m,{measure:c.measure,intent,geom:GEOM});return {svg:renderMap(m,layout,{...c,intent},{intent,edit:false}),summary:sourceSummary('Wardley map',m,m.components.size+' components connected to '+m.anchors.length+' user needs. Horizontal position states evolution; vertical position follows dependencies.')};}}},validate(s){const m=parse(s.t);if(m.components.size>30)throw Error('An article map supports at most 30 components.');}});
