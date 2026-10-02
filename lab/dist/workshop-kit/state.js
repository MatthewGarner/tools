export const clone = value => structuredClone(value);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function text(value, required = false) {if(typeof value!=='string'||value.length>20000||(required&&!value.trim()))throw new Error('Text must be at most 20,000 characters.');return value;}
export function list(value, max, label='items') {if(!Array.isArray(value)||value.length>max)throw new Error(`Keep at most ${max} ${label}.`);return value;}
export function unique(items) {if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Identifiers must be unique.');return items;}
export function record(value, keys) {if(!object(value))throw new Error('A required record is missing.');return Object.fromEntries(keys.map(key=>[key,text(value[key])]));}
export function engine({kind,create,validate,reduce}) {
  const initial=()=>({version:1,activeId:'first',workspaces:[create('first','example')]});
  const validateState=value=>{if(!object(value)||value.version!==1||!Array.isArray(value.workspaces)||!value.workspaces.length)throw new Error('Unknown saved format.');const workspaces=unique(list(value.workspaces,100,'workspaces').map(validate));if(!workspaces.some(work=>work.id===value.activeId))throw new Error('Active workspace is missing.');return{version:1,activeId:value.activeId,workspaces};};
  const active=state=>state.workspaces.find(work=>work.id===state.activeId);
  function transition(state,action) {
    const next=clone(state),index=next.workspaces.findIndex(work=>work.id===next.activeId);
    if(action.type==='@new'||action.type==='@import') {
      text(action.id,true);if(next.workspaces.length>=100||next.workspaces.some(work=>work.id===action.id))throw new Error('Cannot add another workspace.');
      const added=action.type==='@new'?create(action.id,action.example):{...validate(action.workspace),id:action.id};next.workspaces.push(added);next.activeId=added.id;
    } else if(action.type==='@switch') {if(!next.workspaces.some(work=>work.id===action.id))throw new Error('Workspace not found.');next.activeId=action.id;}
    else next.workspaces[index]=reduce(next.workspaces[index],action);
    return next;
  }
  const serialize=work=>JSON.stringify({kind,version:1,workspace:validate(work)},null,2);
  function parse(raw) {let value;if(typeof raw!=='string'||raw.length>12000000)throw new Error('Choose an exported JSON file under 12 MB.');try{value=JSON.parse(raw);}catch{throw new Error('This is not valid JSON.');}if(!object(value)||value.kind!==kind||value.version!==1)throw new Error('Choose a JSON file exported by this workbench.');return validate(value.workspace);}
  return{initial,active,transition,validateState,serialize,parse};
}
export const createHistory=state=>({present:clone(state),past:[],group:null});
export function commit(history,next,group=null) {return{present:next,past:group&&history.group===group?history.past:[...history.past,clone(history.present)].slice(-40),group};}
export function undo(history) {return history.past.length?{present:clone(history.past.at(-1)),past:history.past.slice(0,-1),group:null}:history;}
export const note=value=>value.trim()||'_Not written._';
export const mdField=(label,value)=>`**${label}**\n\n${note(value)}\n`;
