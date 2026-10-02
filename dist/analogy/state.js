export const KEY = 'thinking-lab:analogy:v1';
export const FITS = {unchecked: 'Not checked', fits: 'Holds', partial: 'Partly holds', breaks: 'Breaks here'};
export const PLAN_FIELDS = ['mechanism', 'adaptation', 'boundary', 'test', 'learn'];
export const SOURCES = {
  library: {name:'Library reservations', summary:'Make scarce, reusable capacity available through a queue and a time-limited claim.', principle:'Separate a request from a promise. Make claims visible, allocate by an explicit rule, and release reserved capacity when the claim expires.', roles:[['Requester','Needs temporary access to a resource.'],['Resource pool','Holds scarce, reusable items.'],['Reservation queue','Makes competing claims visible and ordered.'],['Allocator','Applies the rule and holds capacity for a claimant.']], links:[[0,2,'Makes a visible claim'],[2,3,'Provides ordered claims'],[3,1,'Reserves before promising access'],[1,0,'Grants time-limited access'],[0,1,'Returns the resource for reuse']], target:'How could product teams get timely specialist reviews?', targets:[['Product team','Brings a question that needs specialist input.'],['Specialist review hours','The limited time available for reviews.'],['Review backlog','A visible list of questions ready for review.'],['Review coordinator','Balances claims and assigns available review slots.']]},
  triage: {name:'Triage', summary:'Allocate attention by urgency and consequence, then reassess as conditions change.', principle:'Assess before routing. Use explicit urgency criteria to allocate scarce attention, and reassess rather than treating the first classification as final.', roles:[['Incoming case','Arrives with an uncertain level of urgency.'],['Assessor','Looks for signs that change priority.'],['Priority rule','Distinguishes urgency and consequence.'],['Response capacity','Provides limited attention or treatment.']], links:[[0,1,'Supplies evidence for assessment'],[1,2,'Applies explicit criteria'],[2,3,'Directs scarce attention'],[3,0,'Responds, then reassesses']], target:'How could we stop treating every work request as equally urgent?', targets:[['Work request','Describes a need and the consequence of waiting.'],['Triage owner','Clarifies impact before accepting work.'],['Priority criteria','Distinguish real urgency from requester volume.'],['Delivery team','Has limited time to respond.']]},
  rehearsal: {name:'Rehearsal', summary:'Practise a demanding sequence in conditions where mistakes yield feedback at lower cost.', principle:'Represent the consequential parts of a real situation, practise the sequence, observe errors, and change the next attempt before the real event.', roles:[['Performer','Must coordinate actions under real conditions.'],['Score or script','Makes the expected sequence explicit.'],['Practice environment','Represents important conditions with lower consequences.'],['Feedback','Exposes the gap between intended and actual performance.']], links:[[0,1,'Interprets the expected sequence'],[1,2,'Defines a practice scenario'],[2,3,'Makes errors observable'],[3,0,'Changes the next attempt']], target:'How could our team respond more calmly to an incident?', targets:[['On-call team','Coordinates action during an incident.'],['Incident runbook','States roles, checks, and escalation steps.'],['Tabletop exercise','Represents a plausible incident without affecting users.'],['Observer notes','Capture confusion, delays, and missed signals.']]},
  succession: {name:'Ecological succession', summary:'Early occupants change conditions that affect which later occupants can thrive.', principle:'An early intervention changes its environment. Those changed conditions enable some later activities and constrain others; the sequence depends on context and disturbance.', roles:[['Early occupants','Can establish under the initial conditions.'],['Habitat','Is changed by the activity of its occupants.'],['Resources and niches','Enable some ways of living while constraining others.'],['Later occupants','Become viable under the changed conditions.']], links:[[0,1,'Alters local conditions'],[1,2,'Changes what is available'],[2,3,'Enables or constrains establishment'],[3,1,'Changes the conditions again']], target:'How could a small internal tool help a durable platform emerge?', targets:[['Early tool','Solves a narrow, immediate problem.'],['Team workflow','Changes as people use the tool.'],['Shared data and conventions','Make certain later capabilities easier to build.'],['Stable platform','Becomes viable once shared needs are clearer.']]},
  custom: {name:'My source mechanism', summary:'Describe a system you understand well enough to explain how it works.', principle:'', roles:[['',''],['',''],['',''],['','']], links:[[0,1,''],[1,2,''],[2,3,'']], target:'', targets:[['',''],['',''],['',''],['','']]}
};
const clone = value => structuredClone(value);
const blankPlan = () => Object.fromEntries(PLAN_FIELDS.map(key => [key, '']));
const review = () => ({fit:'unchecked', note:'', stale:false});
export function createWorkspace(id = 'first', sourceKey = 'library', blank = false) {
  if (!Object.hasOwn(SOURCES, sourceKey)) throw new Error('Unknown source mechanism.');
  const source = SOURCES[sourceKey];
  const roles = source.roles.map(([label, job], index) => ({id:`${id}-s${index + 1}`, label, job}));
  const targets = (blank ? source.targets.map(() => ['','']) : source.targets).map(([label, job], index) => ({id:`${id}-t${index + 1}`, label, job}));
  const links = source.links.map(([from,to,label], index) => {
    // A source template is a graph: every endpoint must have a role, even in a blank custom mechanism.
    if (!roles[from] || !roles[to]) throw new Error('The source template has a relationship without a role.');
    return {id:`${id}-l${index + 1}`, from:roles[from].id, to:roles[to].id, label};
  });
  const reasons = {library:['Both ask for access to something scarce.','Both set a limit on what can be promised.','Both make competing needs visible.'],triage:['Both arrive with an uncertain urgency.','Both assess evidence before routing attention.','Both make the criteria for priority explicit.'],rehearsal:['Both coordinate action under pressure.','Both make the expected sequence explicit.','Both represent a real situation at lower cost.'],succession:['Both establish before the later system is viable.','Both are changed by their participants.','Both enable some later activities and constrain others.']};
  const mappings = blank || sourceKey === 'custom' ? [] : roles.slice(0,3).map((role,index) => ({sourceId:role.id, targetId:targets[index].id, reason:reasons[sourceKey][index]}));
  const workspace = {id, problem:blank ? '' : source.target, source:{name:source.name, principle:source.principle, roles, links}, targets, mappings, reviews:Object.fromEntries(links.map(link => [link.id, review()])), selectedLink:links.at(-1)?.id || null, plan:blankPlan()};
  if (!blank && sourceKey === 'library') {
    workspace.reviews[links.at(-1).id] = {fit:'breaks', note:'A review hour is consumed, not returned. The reusable unit is the next available slot, not the hour already spent.', stale:false};
    workspace.plan = {mechanism:source.principle, adaptation:'Reserve review slots only when a question is ready. Expire unused holds so another team can take them.', boundary:'Time is consumed rather than returned. We need replenishing capacity and a way to handle genuinely urgent work.', test:'Try a visible reservation queue for one specialist for a week. Track waiting time, unused holds, and urgent exceptions.', learn:'If preparation takes more effort than the waiting time saved, simplify or stop the trial.'};
  }
  return workspace;
}
export function initialState() {const workspace = createWorkspace(); return {version:1,activeId:workspace.id,workspaces:[workspace]};}
export const active = state => state.workspaces.find(workspace => workspace.id === state.activeId);
export const targetFor = (workspace, sourceId) => workspace.targets.find(role => role.id === workspace.mappings.find(mapping => mapping.sourceId === sourceId)?.targetId);
export const roleName = (role, fallback = 'Unnamed role') => role?.label.trim() || fallback;
function invalidate(workspace, sourceIds) {for (const link of workspace.source.links) if (sourceIds.includes(link.from) || sourceIds.includes(link.to)) {const old = workspace.reviews[link.id]; workspace.reviews[link.id] = {...old, fit:'unchecked', stale:old.stale || old.fit !== 'unchecked' || Boolean(old.note.trim())};}}
export function apply(state, action) {
  const next = clone(state), work = active(next);
  switch(action.type) {
    case 'problem': text(action.value); work.problem = action.value; break;
    case 'source':
      if (!['name','principle'].includes(action.field)) throw new Error('Unknown source field.'); text(action.value); work.source[action.field] = action.value; break;
    case 'role': {
      const roles = action.side === 'source' ? work.source.roles : action.side === 'target' ? work.targets : null;
      const role = roles?.find(role => role.id === action.id); if (!role) throw new Error('Role not found.');
      if (!['label','job'].includes(action.field)) throw new Error('Unknown role field.'); text(action.value); role[action.field] = action.value;
      if (action.field === 'job') invalidate(work, action.side === 'source' ? [role.id] : work.mappings.filter(mapping => mapping.targetId === role.id).map(mapping => mapping.sourceId));
      break;
    }
    case 'add-role': {
      const roles = action.side === 'source' ? work.source.roles : action.side === 'target' ? work.targets : null;
      if (!roles || roles.length >= 6) throw new Error('Keep at most six roles on each side.');
      if (!action.id || [...work.source.roles,...work.targets].some(role => role.id === action.id)) throw new Error('Role id must be new.');
      roles.push({id:action.id,label:'',job:''}); break;
    }
    case 'remove-role': {
      if (action.side === 'source') {
        if (!work.source.roles.some(role => role.id === action.id)) throw new Error('Role not found.');
        work.source.roles = work.source.roles.filter(role => role.id !== action.id);
        work.source.links = work.source.links.filter(link => link.from !== action.id && link.to !== action.id);
        work.reviews = Object.fromEntries(work.source.links.map(link => [link.id,work.reviews[link.id]]));
        work.mappings = work.mappings.filter(mapping => mapping.sourceId !== action.id);
        if (!work.source.links.some(link => link.id === work.selectedLink)) work.selectedLink = work.source.links[0]?.id || null;
      } else if (action.side === 'target') {
        if (!work.targets.some(role => role.id === action.id)) throw new Error('Role not found.');
        invalidate(work,work.mappings.filter(mapping => mapping.targetId === action.id).map(mapping => mapping.sourceId));
        work.targets = work.targets.filter(role => role.id !== action.id); work.mappings = work.mappings.filter(mapping => mapping.targetId !== action.id);
      } else throw new Error('Unknown role side.'); break;
    }
    case 'map': {
      if (!work.targets.some(role => role.id === action.targetId) || (action.sourceId !== null && !work.source.roles.some(role => role.id === action.sourceId))) throw new Error('Choose existing roles.');
      const existing = work.mappings.filter(mapping => mapping.targetId === action.targetId || mapping.sourceId === action.sourceId);
      if (existing.length === 1 && existing[0].sourceId === action.sourceId && existing[0].targetId === action.targetId) return next;
      invalidate(work,[...existing.map(mapping => mapping.sourceId), action.sourceId].filter(Boolean));
      work.mappings = work.mappings.filter(mapping => mapping.targetId !== action.targetId && mapping.sourceId !== action.sourceId);
      if (action.sourceId !== null) work.mappings.push({sourceId:action.sourceId,targetId:action.targetId,reason:''}); break;
    }
    case 'reason': {
      const mapping = work.mappings.find(mapping => mapping.sourceId === action.sourceId); if (!mapping) throw new Error('Match a role first.'); text(action.value); mapping.reason = action.value; break;
    }
    case 'link': {
      const link = work.source.links.find(link => link.id === action.id); if (!link || !['from','to','label'].includes(action.field)) throw new Error('Relationship not found.');
      if (action.field === 'label') text(action.value); else if (!work.source.roles.some(role => role.id === action.value)) throw new Error('Endpoint role not found.');
      link[action.field] = action.value; const previous = work.reviews[link.id]; work.reviews[link.id] = {...previous,fit:'unchecked',stale:previous.stale || previous.fit !== 'unchecked' || Boolean(previous.note.trim())}; break;
    }
    case 'add-link':
      if (work.source.links.length >= 10 || !work.source.roles.length) throw new Error('Add roles first; keep at most ten relationships.');
      if (!action.id || work.source.links.some(link => link.id === action.id)) throw new Error('Relationship id must be new.');
      work.source.links.push({id:action.id,from:work.source.roles[0].id,to:work.source.roles[1]?.id || work.source.roles[0].id,label:''}); work.reviews[action.id] = review(); work.selectedLink = action.id; break;
    case 'remove-link':
      if (!work.source.links.some(link => link.id === action.id)) throw new Error('Relationship not found.');
      work.source.links = work.source.links.filter(link => link.id !== action.id); delete work.reviews[action.id];
      if (work.selectedLink === action.id) work.selectedLink = work.source.links[0]?.id || null; break;
    case 'select-link': if (!work.source.links.some(link => link.id === action.id)) throw new Error('Relationship not found.'); work.selectedLink = action.id; break;
    case 'review': {
      const link = work.source.links.find(link => link.id === action.id); if (!link || !['fit','note'].includes(action.field)) throw new Error('Unknown relationship check.');
      if (action.field === 'fit') {if (!Object.hasOwn(FITS,action.value)) throw new Error('Unknown fit.'); if (action.value !== 'unchecked' && (!targetFor(work,link.from) || !targetFor(work,link.to))) throw new Error('Map both endpoint roles before judging this relationship.'); work.reviews[link.id].stale = false;}
      else text(action.value); work.reviews[link.id][action.field] = action.value; break;
    }
    case 'plan': if (!PLAN_FIELDS.includes(action.field)) throw new Error('Unknown plan field.'); text(action.value); work.plan[action.field] = action.value; break;
    case 'copy-mechanism': work.plan.mechanism = work.source.principle; break;
    case 'new': {
      if (next.workspaces.length >= 100 || next.workspaces.some(item => item.id === action.id)) throw new Error('Cannot add another workspace.');
      next.workspaces.push(createWorkspace(action.id,action.source,action.blank)); next.activeId = action.id; break;
    }
    case 'fork-source': {
      if (next.workspaces.length >= 100 || next.workspaces.some(item => item.id === action.id)) throw new Error('Cannot add another workspace.');
      const added = createWorkspace(action.id,action.source,true); added.problem = work.problem; added.targets = work.targets.map((role,index) => ({...role,id:`${action.id}-t${index+1}`})); next.workspaces.push(added); next.activeId = added.id; break;
    }
    case 'switch': if (!next.workspaces.some(item => item.id === action.id)) throw new Error('Workspace not found.'); next.activeId = action.id; break;
    case 'import': {
      if (next.workspaces.length >= 100 || next.workspaces.some(item => item.id === action.id)) throw new Error('Cannot add another workspace.');
      const imported = validateWorkspace(action.workspace), sourceIds = new Map(imported.source.roles.map((role,index) => [role.id,`${action.id}-s${index+1}`])), targetIds = new Map(imported.targets.map((role,index) => [role.id,`${action.id}-t${index+1}`])), linkIds = new Map(imported.source.links.map((link,index) => [link.id,`${action.id}-l${index+1}`]));
      imported.id = action.id; imported.source.roles.forEach(role => role.id = sourceIds.get(role.id)); imported.targets.forEach(role => role.id = targetIds.get(role.id));
      imported.source.links.forEach(link => {link.id = linkIds.get(link.id); link.from = sourceIds.get(link.from); link.to = sourceIds.get(link.to);});
      imported.mappings.forEach(mapping => {mapping.sourceId = sourceIds.get(mapping.sourceId); mapping.targetId = targetIds.get(mapping.targetId);});
      imported.reviews = Object.fromEntries(Object.entries(imported.reviews).map(([id,value]) => [linkIds.get(id),value])); imported.selectedLink = imported.selectedLink ? linkIds.get(imported.selectedLink) : null;
      next.workspaces.push(imported); next.activeId = imported.id; break;
    }
    default: throw new Error('Unknown action.');
  }
  return next;
}
export function createHistory(state) {return {present:clone(state),past:[],group:null};}
export function change(history,action,group=null) {const next=apply(history.present,action);return {present:next,past:group && group === history.group ? history.past : [...history.past,clone(history.present)].slice(-40),group};}
export function undo(history) {return history.past.length ? {present:clone(history.past.at(-1)),past:history.past.slice(0,-1),group:null} : history;}
function object(value) {return value !== null && typeof value === 'object' && !Array.isArray(value);}
function text(value,required=false) {if (typeof value !== 'string' || value.length > 20000 || (required && !value.trim())) throw new Error('Text must be at most 20,000 characters.'); return value;}
function roles(value) {if (!Array.isArray(value) || value.length > 6) throw new Error('A side can contain up to six roles.'); return value.map(role => {if (!object(role)) throw new Error('Invalid role.'); return {id:text(role.id,true),label:text(role.label),job:text(role.job)};});}
export function validateWorkspace(value) {
  if (!object(value) || !object(value.source) || !object(value.reviews) || !object(value.plan)) throw new Error('Invalid analogy workspace.');
  const sourceRoles = roles(value.source.roles), targets = roles(value.targets), allIds = [...sourceRoles,...targets].map(role => role.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('Role ids must be unique.');
  const sourceIds = new Set(sourceRoles.map(role => role.id)), targetIds = new Set(targets.map(role => role.id));
  if (!Array.isArray(value.source.links) || value.source.links.length > 10) throw new Error('Invalid relationship list.');
  const links = value.source.links.map(link => {if (!object(link) || !sourceIds.has(link.from) || !sourceIds.has(link.to)) throw new Error('A relationship has a missing endpoint.'); return {id:text(link.id,true),from:link.from,to:link.to,label:text(link.label)};});
  const linkIds = new Set(links.map(link => link.id)); if (linkIds.size !== links.length || (value.selectedLink !== null && !linkIds.has(value.selectedLink))) throw new Error('Relationship selection is inconsistent.');
  if (!Array.isArray(value.mappings)) throw new Error('Invalid mappings.');
  const mappings = value.mappings.map(mapping => {if (!object(mapping) || !sourceIds.has(mapping.sourceId) || !targetIds.has(mapping.targetId)) throw new Error('A mapping has a missing role.'); return {sourceId:mapping.sourceId,targetId:mapping.targetId,reason:text(mapping.reason)};});
  if (new Set(mappings.map(mapping => mapping.sourceId)).size !== mappings.length || new Set(mappings.map(mapping => mapping.targetId)).size !== mappings.length) throw new Error('Map each role at most once.');
  const reviews = Object.fromEntries(links.map(link => {const item=value.reviews[link.id]; if (!object(item) || !Object.hasOwn(FITS,item.fit) || typeof item.stale !== 'boolean') throw new Error('Invalid relationship check.'); if (item.fit !== 'unchecked' && (!mappings.some(mapping => mapping.sourceId === link.from) || !mappings.some(mapping => mapping.sourceId === link.to))) throw new Error('A checked relationship must have both roles mapped.'); return [link.id,{fit:item.fit,note:text(item.note),stale:item.stale}];}));
  return {id:text(value.id,true),problem:text(value.problem),source:{name:text(value.source.name),principle:text(value.source.principle),roles:sourceRoles,links},targets,mappings,reviews,selectedLink:value.selectedLink,plan:Object.fromEntries(PLAN_FIELDS.map(key => [key,text(value.plan[key])]))};
}
export function validateState(value) {if (!object(value) || value.version !== 1 || !Array.isArray(value.workspaces) || !value.workspaces.length || value.workspaces.length > 100) throw new Error('Unknown saved format.'); const workspaces=value.workspaces.map(validateWorkspace); if (new Set(workspaces.map(item => item.id)).size !== workspaces.length || !workspaces.some(item => item.id === value.activeId)) throw new Error('Invalid workspace list.'); return {version:1,activeId:value.activeId,workspaces};}
export const serialize = workspace => JSON.stringify({kind:'thinking-lab-analogy',version:1,workspace:validateWorkspace(workspace)},null,2);
export function parse(raw) {let value; if (typeof raw !== 'string' || raw.length > 7000000) throw new Error('Choose an exported JSON file under 7 MB.'); try {value=JSON.parse(raw);} catch {throw new Error('This is not valid JSON.');} if (!object(value) || value.kind !== 'thinking-lab-analogy' || value.version !== 1) throw new Error('Choose an Analogy Workshop export.'); return validateWorkspace(value.workspace);}
export function markdown(work) {
  const content=value=>value.trim() || '_Not written._', parts=['# Analogy workshop','',content(work.problem),'',`## Source: ${content(work.source.name)}`,'',content(work.source.principle),'','## Function mappings',''];
  for (const role of work.source.roles) {const mapping=work.mappings.find(item=>item.sourceId===role.id),target=targetFor(work,role.id); parts.push(`### ${roleName(role)} → ${target ? roleName(target) : 'Unmapped'}`,'',`Source function: ${content(role.job)}`,'',`Target function: ${target ? content(target.job) : '_Unmapped._'}`,'',`Why the match: ${mapping ? content(mapping.reason) : '_Not mapped._'}`,'');}
  const unmapped=work.targets.filter(role=>!work.mappings.some(mapping=>mapping.targetId===role.id)); if (unmapped.length) parts.push('### Unmapped target roles','',...unmapped.map(role=>`- ${roleName(role)}: ${content(role.job)}`),'');
  parts.push('## Relationship checks','');
  for (const link of work.source.links) {const item=work.reviews[link.id]; parts.push(`### ${roleName(work.source.roles.find(role=>role.id===link.from))} → ${roleName(work.source.roles.find(role=>role.id===link.to))}`,'',content(link.label),'',`In the target: ${roleName(targetFor(work,link.from),'Unmapped')} → ${roleName(targetFor(work,link.to),'Unmapped')}`,'',`${FITS[item.fit]}${item.stale ? ' · mapping changed; recheck' : ''}`,'',content(item.note),'');}
  parts.push('## Adaptation & test',''); for (const [key,label] of [['mechanism','Mechanism to keep'],['adaptation','Adaptation'],['boundary','Where the analogy breaks'],['test','Smallest test'],['learn','What would change my mind']]) parts.push(`**${label}**`,'',content(work.plan[key]),'');
  return parts.join('\n');
}
