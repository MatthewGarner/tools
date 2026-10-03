import {validateState,applyControl,statePath} from '../core/schema.js';
import {definitionMetadata,readExampleState,validateControls,selectView} from '../core/definition.js';
import {fullToolURL,decodeArticleFragment} from '../core/codec.js';
import {createProjector} from './projector.js';
import {parentOrigin,validThemeMessage} from '../v1/bridge.js';

function element(tag, attributes = {}, text){
  const node = document.createElement(tag);
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if(text !== undefined) node.textContent = text;
  return node;
}
function renderContext(width){
  const css = getComputedStyle(document.documentElement), get = name => css.getPropertyValue('--'+name).trim();
  const colors = Object.fromEntries(['card','border','ink','muted','grid','accent','bg','err','track','brand'].map(name=>[name,get(name)]));
  colors.accentInk=get('accent-ink');colors.brandText=get('brand-text');
  colors.status=Object.fromEntries(['done','doing','risk','blocked'].map(name=>[name,get('st-'+name)]));
  colors.statusInk=Object.fromEntries(['done','doing','risk','blocked'].map(name=>[name,get('st-'+name+'-ink')]));
  Object.assign(colors,{paper:colors.bg,background:colors.bg,line:colors.border,text:colors.ink});
  const canvas=document.createElement('canvas'), context=canvas.getContext('2d');
  return {width,theme:document.documentElement.dataset.theme,dark:document.documentElement.dataset.theme==='dark',colors,
    today:'2026-10-03',measure(text,font='16px system-ui'){context.font=font;return context.measureText(String(text)).width;}};
}
function outputFragment(result){
  if(!result || typeof result.summary!=='string' || !result.summary.trim() ||
    (typeof result.svg!=='string' && typeof result.html!=='string')) throw Error('The tool did not produce an accessible illustration.');
  const markup=result.svg ?? result.html;
  if(markup.length>2000000) throw Error('This illustration is too large. Use a smaller example.');
  const template=element('template');template.innerHTML=markup;
  if(template.content.querySelector('script,iframe,object,embed,link,meta,base,form')) throw Error('The illustration contains unsupported content.');
  const externalCSS=value=>/@import/i.test(value)||[...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(match=>!match[1].trim().replace(/^['"]|['"]$/g,'').startsWith('#'));
  for(const node of template.content.querySelectorAll('*')){
    if(node.localName==='style' && externalCSS(node.textContent))throw Error('The illustration contains an external stylesheet resource.');
    for(const attr of node.attributes){
      if(externalCSS(attr.value))throw Error('The illustration contains an external style resource.');
      if(/^on/i.test(attr.name) || attr.name==='srcdoc') throw Error('The illustration contains executable content.');
      if(['href','src','xlink:href'].includes(attr.name.toLowerCase())){
        if(attr.value.startsWith('#')) continue;
        if(node.localName==='a' && /^https?:\/\//i.test(attr.value)){
          node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');continue;
        }
        if(node.localName==='img' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(attr.value)) continue;
        throw Error('The illustration contains an unsupported external resource.');
      }
    }
  }
  return template.content;
}

export async function mount(definition, root=document.getElementById('embed'), options={}){
  if(!root) throw Error('The embed host is missing.');
  const standalone=options.mode==='tool';
  const handoff=state=>{
    const url=new URL(fullToolURL(definition,state));
    if(location.protocol==='http:' && ['localhost','127.0.0.1'].includes(location.hostname) && url.origin==='https://tools.matthewgarner.me')return location.origin+url.pathname+url.hash;
    return url.href;
  };
  const origin=parentOrigin({origin:location.origin,search:location.search,referrer:document.referrer});
  const send=message=>{if(!standalone && parent!==window && origin) parent.postMessage({...message,version:1},origin);};
  const system=matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.dataset.theme=system.matches?'dark':'light';
  let assetsReady=false,externalTheme=false,ready=false,disposed=false,revision=0,scheduled=0;
  let state,committed,selection,controls=new Map(),previousWidth=0,previousHeight=0,resizeFrame=0;
  const projector=definition.worker ? createProjector(options.moduleURL) : null;
  const error=element('p',{role:'alert',class:'embed-error',hidden:''});
  const stage=element('div',{class:'embed-stage','aria-label':'Tool illustration'});
  const summary=element('p',{class:'embed-summary'});
  const description=element('details',{class:'embed-description'});
  description.append(element('summary',{},'Text description'),summary);
  const live=element('p',{role:'status',class:'embed-status','aria-live':'polite'});
  const form=element('div',{class:'embed-controls'});
  const link=element('a',{target:'_blank',rel:'noopener noreferrer'},definition.fullTool?.label || 'Open full '+definition.title+' ↗');
  const reset=element('button',{type:'button'},'Reset example');
  const overflow=element('p',{class:'embed-overflow',hidden:''},'Scroll inside the illustration to see the whole view.');
  const footer=element('footer',{class:'embed-footer'});
  footer.append(reset,link);
  const reportError=exception=>{error.hidden=false;error.textContent=exception instanceof Error?exception.message:'This example could not be rendered.';};
  // ResizeObserver delivery must not mutate the observed layout (WebKit reports a loop).
  const queueResize=()=>{if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});};
  const resize=()=>{
    if(!ready || disposed)return;
    const scrolls=stage.scrollWidth>stage.clientWidth+1 || stage.scrollHeight>stage.clientHeight+1;
    overflow.hidden=!scrolls;
    if(scrolls){stage.setAttribute('tabindex','0');stage.setAttribute('role','region');}
    else{stage.removeAttribute('tabindex');stage.removeAttribute('role');}
    const height=Math.ceil(root.getBoundingClientRect().height);
    if(height!==previousHeight){previousHeight=height;send({type:'mg-tool:resize',height});}
  };
  function reflectControls(){
    for(const [id,{input,output}] of controls){
      const control=definition.controls[id];
      if(control.type==='action')continue;
      const value=statePath(state,control.path);
      if(control.type==='checkbox')input.checked=value;
      else if(control.type==='select')input.value=String(control.options.findIndex(option=>JSON.stringify(option.value)===JSON.stringify(value)));
      else input.value=String(value);
      if(output)output.value=String(value);
    }
  }
  function schedule(){
    revision++;
    stage.setAttribute('aria-busy','true');link.removeAttribute('href');
    if(!assetsReady)return;
    if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;void render(revision);});
  }
  async function render(ticket){
    const next=state;
    try{
      const width=Math.max(240,Math.floor(stage.clientWidth));
      const projected=projector ? await projector.project(next,selection.id) : undefined;
      if(disposed || ticket!==revision)return;
      const result=await selection.view.render(next,renderContext(width),projected);
      if(disposed || ticket!==revision)return;
      const fragment=outputFragment(result), href=handoff(next);
      stage.replaceChildren(fragment);summary.textContent=result.summary;link.href=href;
      if(standalone)history.replaceState(null,'',location.pathname+location.search+new URL(href).hash);
      stage.setAttribute('aria-busy','false');stage.setAttribute('aria-label',selection.view.title);
      committed=structuredClone(next);error.hidden=true;live.textContent='';
      root.dataset.embedState='ready';
      if(!ready){ready=true;send({type:'mg-tool:ready'});}
      queueResize();
    }catch(exception){
      if(disposed || ticket!==revision)return;
      stage.setAttribute('aria-busy','false');reportError(exception);
      if(committed){state=structuredClone(committed);reflectControls();link.href=handoff(state);}
      else{root.dataset.embedState='error';send({type:'mg-tool:error'});}
    }
  }
  function change(id,input){
    try{const next=applyControl(definition,state,id,input);validateControls(definition,next,selection.controls);state=next;reflectControls();schedule();}
    catch(exception){reportError(exception);reflectControls();}
  }
  function addControl(id){
    const control=definition.controls[id],wrapper=element('div',{class:'embed-control'});
    if(control.type==='action'){
      const button=element('button',{type:'button'},control.label);
      button.addEventListener('click',()=>change(id));wrapper.append(button);form.append(wrapper);controls.set(id,{input:button});return;
    }
    const inputId='control-'+id,label=element('label',{for:inputId},control.label);
    let input,output;
    if(control.type==='select'){
      input=element('select',{id:inputId});
      control.options.forEach((option,i)=>input.append(element('option',{value:i},option.label)));
    }else if(control.type==='textarea'){
      input=element('textarea',{id:inputId,rows:5,maxlength:control.maxLength,spellcheck:'false'});
      wrapper.classList.add('embed-source');
    }else{
      input=element('input',{id:inputId,type:control.type==='text'?'text':control.type});
      if(['range','number'].includes(control.type)){
        input.min=control.min;input.max=control.max;input.step=control.step;
        if(control.type==='range'){output=element('output',{for:inputId});label.append(output);}
      }
      if(control.maxLength)input.maxLength=control.maxLength;
    }
    const read=()=>control.type==='checkbox'?input.checked:control.type==='select'?control.options[Number(input.value)]?.value:input.value;
    if(control.type==='range')input.addEventListener('input',()=>{output.value=input.value;});
    if(control.type==='textarea'){
      const details=element('details'),legend=element('summary',{},control.label),apply=element('button',{type:'button'},'Apply changes');
      label.classList.add('visually-hidden');
      apply.addEventListener('click',()=>change(id,read()));
      details.append(legend,label,input,apply);wrapper.append(details);
    }else{
      input.addEventListener(control.commit || ['select','checkbox'].includes(control.type)?'change':'input',()=>change(id,read()));
      wrapper.append(label,input);
    }
    controls.set(id,{input,output});form.append(wrapper);
  }
  const receive=event=>{
    if(!validThemeMessage(event,parent,origin))return;
    externalTheme=true;
    if(document.documentElement.dataset.theme!==event.data.theme){document.documentElement.dataset.theme=event.data.theme;if(selection)schedule();}
  };
  const systemChange=()=>{if(!externalTheme){document.documentElement.dataset.theme=system.matches?'dark':'light';if(selection)schedule();}};
  addEventListener('message',receive);system.addEventListener('change',systemChange);
  const observer=new ResizeObserver(()=>{
    const width=Math.floor(stage.clientWidth);
    if(width>0 && width!==previousWidth){previousWidth=width;if(selection)schedule();}
    queueResize();
  });
  observer.observe(root);observer.observe(stage);
  const dispose=()=>{disposed=true;cancelAnimationFrame(scheduled);cancelAnimationFrame(resizeFrame);observer.disconnect();projector?.dispose();removeEventListener('message',receive);system.removeEventListener('change',systemChange);};
  addEventListener('pagehide',dispose,{once:true});
  try{
    definitionMetadata(definition);
    selection=standalone ? {...selectView(definition),state:validateState(definition,location.hash?decodeArticleFragment(location.hash,{tool:definition.id,version:definition.version}):definition.initialState)} : readExampleState(definition,location.hash);state=selection.state;
    validateControls(definition,state,selection.controls);
    if(standalone){link.hidden=true;root.classList.add('tool-standalone');}
    const initial=structuredClone(state);
    const header=element('header',{class:'embed-heading'});
    header.append(element('p',{class:'embed-eyebrow'},definition.title),element('h1',{},selection.view.title));
    if(definition.status!=='active')header.append(element('p',{class:'embed-note'},definition.status==='archived'?'An archived experiment.':'An earlier version of this workbench.'));
    root.replaceChildren(header,error,form,stage,overflow,description,live,footer);
    selection.controls.forEach(addControl);reflectControls();
    reset.hidden=!selection.controls.length;
    reset.addEventListener('click',()=>{state=validateState(definition,initial);reflectControls();schedule();live.textContent='Example reset.';});
    if(definition.fullTool.description)footer.append(element('p',{class:'embed-note'},definition.fullTool.description));
    await loadFonts(options.fonts??[]);
    await document.fonts.ready;
    assetsReady=true;previousWidth=Math.floor(stage.clientWidth);
    schedule();
  }catch(exception){root.dataset.embedState='error';root.replaceChildren(element('h1',{},'Example unavailable'),error);reportError(exception);send({type:'mg-tool:error'});}
  return dispose;
}

async function loadFonts(fonts){
  await Promise.all(fonts.map(async face=>{
    const url=new URL(face.url,location.href);
    if(url.origin!==location.origin || !url.pathname.endsWith('.woff2'))throw Error('Invalid illustration font.');
    const font=new FontFace(face.family,`url("${url.href}")`,{weight:face.weight,unicodeRange:face.unicodeRange,display:'block'});
    await font.load();document.fonts.add(font);
  }));
}
