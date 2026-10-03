// Templates are explicit, immutable starting material. Per-record keys avoid
// replacing another tab's collection; defaults are pointers, never live models.
export const TEMPLATE_PREFIX = 'mg:template:v1:';
export const TEMPLATE_DEFAULT_PREFIX = 'mg:template-default:v1:';
export const TEMPLATE_LIMIT = 20;
// Include JSON escaping and multibyte text in the same per-value ceiling used
// by browser backups; a successfully saved template must remain exportable.
export const TEMPLATE_BYTES = 5000000;
const slug = /^[a-z0-9-]{1,64}$/;
const scopes = ['tools','energy','lab'];
const formats = ['model-link','workspace-json'];
export function templateKeyInfo(key) {
  if(typeof key!=='string')return null;
  const isDefault=key.startsWith(TEMPLATE_DEFAULT_PREFIX),prefix=isDefault?TEMPLATE_DEFAULT_PREFIX:TEMPLATE_PREFIX;
  if(!key.startsWith(prefix))return null;
  const parts=key.slice(prefix.length).split(':'),[scope,tool,id]=parts;
  return scopes.includes(scope)&&typeof tool==='string'&&slug.test(tool)&&parts.length===(isDefault?2:3)&&(isDefault||slug.test(id))?{scope,tool,id,isDefault}:null;
}
export function validTemplate(value, scope, tool) {
  return !!value&&value.v===1&&value.scope===scope&&value.tool===tool&&scopes.includes(scope)&&slug.test(tool)
    &&typeof value.id==='string'&&slug.test(value.id)&&typeof value.name==='string'&&value.name.trim().length>0&&value.name.length<=120
    &&formats.includes(value.format)&&typeof value.content==='string'&&value.content.length>0&&value.content.length<=TEMPLATE_BYTES
    &&Number.isSafeInteger(value.savedAt)&&value.savedAt>0&&new TextEncoder().encode(JSON.stringify(value)).byteLength<=TEMPLATE_BYTES;
}
export function templateStore(storage,scope,tool) {
  if(!scopes.includes(scope)||typeof tool!=='string'||!slug.test(tool))throw Error('Unknown template collection.');
  const prefix=`${TEMPLATE_PREFIX}${scope}:${tool}:`,defaultKey=`${TEMPLATE_DEFAULT_PREFIX}${scope}:${tool}`;
  const key=id=>{if(typeof id!=='string'||!slug.test(id))throw Error('Invalid template.');return prefix+id;};
  const read=id=>{const raw=storage.getItem(key(id));if(raw===null)return null;let value;try{value=JSON.parse(raw);}catch{throw Error('This template needs recovery. Its saved data is unchanged.');}if(!validTemplate(value,scope,tool)||value.id!==id)throw Error('This template needs recovery. Its saved data is unchanged.');return value;};
  const list=()=>{const items=[],issues=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix))continue;const id=k.slice(prefix.length);try{const item=read(id);if(item)items.push(item);}catch{issues.push(k);}}return{items:items.sort((a,b)=>b.savedAt-a.savedAt||a.id.localeCompare(b.id)),issues};};
  const current=expected=>{const found=read(expected.id);if(!found||JSON.stringify(found)!==JSON.stringify(expected))throw Error('This template changed in another tab. Reopen Templates to use the latest version.');return found;};
  const write=value=>{if(!validTemplate(value,scope,tool))throw Error('This template cannot be saved. Keep its complete saved value under 5 MB; export larger work as JSON instead.');storage.setItem(key(value.id),JSON.stringify(value));return value;};
  return {list,read,
    add({id,name,format,content,savedAt}){if(storage.getItem(key(id))!==null)throw Error('A template with this identifier already exists.');const found=list();if(found.items.length+found.issues.length>=TEMPLATE_LIMIT)throw Error('Keep at most 20 templates for this tool. Remove a template before adding another.');return write({v:1,scope,tool,id,name:name.trim(),format,content,savedAt});},
    rename(expected,name){return write({...current(expected),name:name.trim()});},
    remove(expected){current(expected);if(storage.getItem(defaultKey)===expected.id)storage.removeItem(defaultKey);storage.removeItem(key(expected.id));},
    getDefault(){const id=storage.getItem(defaultKey);if(id===null)return null;const value=read(id);if(!value)throw Error('The default template is unavailable. Choose another default in Templates, or start blank.');return value;},
    setDefault(expected){current(expected);storage.setItem(defaultKey,expected.id);},
    clearDefault(){storage.removeItem(defaultKey);},
  };
}
