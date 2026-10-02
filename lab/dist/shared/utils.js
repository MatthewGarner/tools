export function escapeHtml(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function downloadText(filename,text,mime='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function readStore(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):structuredClone(fallback);}catch{return structuredClone(fallback);}}
export function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
