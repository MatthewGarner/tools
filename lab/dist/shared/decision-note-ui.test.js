import test from 'node:test';
import assert from 'node:assert/strict';
import {copyDecisionNote} from './decision-note-ui.js';

test('copy preserves the full note and blocked clipboard exposes safe selectable text',async()=>{
  const text='# Authored note\n\n</textarea><script>untrusted()</script>\n'+'Long material. '.repeat(200);
  let copied='',message='',html='',title='',focused=false,selected=false;
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  try{
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value;}}}});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:id=>{assert.equal(id,'decision-note-copy');return {style:{},focus(){focused=true;},select(){selected=true;}};}}});
    const callbacks={toast:value=>message=value,open:(value,heading)=>{html=value;title=heading;}};
    assert.equal(await copyDecisionNote(text,callbacks),true);assert.equal(copied,text);assert.equal(message,'Decision note copied.');assert.equal(html,'');
    navigator.clipboard.writeText=async()=>{throw Error('denied');};
    assert.equal(await copyDecisionNote(text,callbacks),false);
    assert.equal(title,'Copy decision note');assert.ok(focused&&selected);
    assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;untrusted()&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));assert.ok(html.includes('Long material. '.repeat(200)));
  }finally{
    if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
    if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete globalThis.document;
  }
});
