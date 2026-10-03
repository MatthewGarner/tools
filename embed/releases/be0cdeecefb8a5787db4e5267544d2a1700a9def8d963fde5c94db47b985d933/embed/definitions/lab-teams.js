import {CAPABILITIES,TEAM_NAMES,DEFAULT_LAYOUT,DEFAULT_ASSUMPTIONS,simulate} from '../../lab/dist/teams/engine.js';
import {validatePortable,activeWorkload} from '../../lab/dist/teams/library.js';
import {DEFAULT_RELATIONSHIPS,LAYERS,CONNECTORS,coordinationFor} from '../../lab/dist/teams/relationships.js';
import {base,clone,select,range,columns,number,nativeSchema} from './_lab.js';
const initial={layout:clone(DEFAULT_LAYOUT),names:clone(TEAM_NAMES),scenario:'rush',assumptions:clone(DEFAULT_ASSUMPTIONS),day:10,trace:null,baseline:{layout:clone(DEFAULT_LAYOUT),names:clone(TEAM_NAMES),relationships:clone(DEFAULT_RELATIONSHIPS)},workloads:[],designs:[],relationships:clone(DEFAULT_RELATIONSHIPS)};
const validate=s=>validatePortable({format:'thinking-lab-teams',version:1,session:s});
const memberships=Object.fromEntries(CAPABILITIES.map(c=>[c.id,select(c.name+' team',['layout',c.id],TEAM_NAMES)]));
const controls={...memberships,map:select('Organisational view',['relationships','view'],Object.fromEntries(Object.entries(LAYERS).map(([k,v])=>[k,v.label])))};
for(const [key,label] of Object.entries(CONNECTORS))controls[key]=range(label+' available hours',['relationships','hours',key],0,120);
for(const [key,layer]of Object.entries(LAYERS))controls['owner-'+key]=select(layer.job+' owner',['relationships','owners',key],{none:'No owner',...CONNECTORS});
const views={
 handoffs:{title:'Boundaries and waiting',description:'The same six specialists face the same workload in both arrangements.',controls:Object.keys(memberships),render(s,ctx){
  const r=simulate({...s,scenario:activeWorkload(s)}),b=s.baseline?simulate({...s,layout:s.baseline.layout,scenario:activeWorkload(s)}):null,f=r.final;
  const lanes=Object.entries(s.names).map(([id,label])=>({label,items:CAPABILITIES.filter(c=>s.layout[c.id]===id).map(c=>({title:c.name,detail:'One specialist'}))}));
  const rows=[`After 30 days: ${f.completed} completed · ${f.unfinished} unfinished · ${number(f.medianLeadTime)} days median lead time · ${f.handoffs} handoffs`];
  if(b)rows.push(`Pinned arrangement · same workload: ${b.final.completed} completed · ${b.final.unfinished} unfinished · ${number(b.final.medianLeadTime)} days median lead time · ${b.final.handoffs} handoffs`);
  return{svg:columns('How teams fit the work','Six specialists · move a capability across the team boundaries',lanes,ctx,rows.join('\n')+'\nLead time includes completed work only. Shared coordination/boundary assumptions are illustrative.'),summary:rows.join(' ')};
 }},
 maps:{title:'Maps and invisible coordination',description:'The same work crosses customer, technical, funding and team boundaries.',controls:['map','ari','bea','cam',...Object.keys(LAYERS).map(key=>'owner-'+key)],defaultControls:['map','owner-customer','ari'],render(s,ctx){
  const r=s.relationships,out=coordinationFor(s.layout,activeWorkload(s),r),groups=r.view==='team'?s.names:LAYERS[r.view].groups;
  const lanes=Object.entries(groups).map(([id,label])=>({label,items:CAPABILITIES.filter(c=>out.maps[r.view][c.id]===id).map(c=>({title:c.name,detail:LAYERS[r.view].label}))}));
  const rows=out.rows.map(row=>`${row.label}: ${number(row.requested)} hours needed, ${number(row.gap)} uncovered; ${CONNECTORS[row.owner]||'no owner'}.`);
  const summary=`${number(out.gap)} of ${number(out.requested)} coordination hours uncovered. `+rows.join(' ');
  return{svg:columns('One organisation, four maps',LAYERS[r.view].label+' · same six capabilities and workload',lanes,ctx,summary+' Separate planning ledger; liaison time is shared across roles. No inferred delivery penalty.'),summary};
 }}
};
export const definition=base('teams','How teams fit the work','Move capabilities across boundaries, inspect organisational maps and uncover unowned coordination.',initial,validate,views,controls,{},nativeSchema(initial));
definition.version=2;
export const toToolState=clone;
// Undo history belongs to the native session, not the authored article state.
export const fromToolState=validate;
// Published v1 links retain their arrangement and workload. New map settings
// receive the same defaults as old native saves; edits then write a v2 link.
export const articleMigrations={1:validate};
