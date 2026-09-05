import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';
import {DEFAULT_TEXT} from '../examples.js';
const ctx={width:960,measure:(s,f)=>s.length*(parseFloat(f.match(/([\d.]+)px/)?.[1])||16)*.5};
test('brief distinguishes approval scope, unresolved choice and qualifications',()=>{
 const svg=render(parse(DEFAULT_TEXT),ctx,{live:true,selected:'claim:policy'});
 for(const s of ['Fund the pilot. Keep launch open.','Pilot approved','Paid-tier launch remains undecided','Expected value compares authored','REASONS &amp; BASIS'])assert.ok(svg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').includes(s),s);
 assert.doesNotMatch(svg,/\d+ exhibits|\d+ lanes|no verdict yet/);assert.match(svg,/data-kind="claim" data-id="policy"/);
});
test('every view wraps phone content and retains its reading purpose',()=>{
 for(const view of ['brief','compare','review']){
 const svg=render(parse(DEFAULT_TEXT+'\nview: '+view),{...ctx,width:390},{live:true});
 assert.match(svg,/width="390"/);assert.doesNotMatch(svg,/NaN|Infinity/);
 if(view==='brief')assert.ok(svg.includes('launch open.'));
 if(view==='compare')assert.ok(svg.includes('WHAT MUST BE TRUE'));
 if(view==='review')assert.ok(svg.includes('Record a review'));
 }
});
test('legacy exhibits retain the full Paths assumption receipt',()=>{
 const model=parse('title: Legacy case\nDecision: Projection -> /roadmap/#x // Conditional only');
 model.exhibits[0].planning={role:'Delivery projection',scope:'One exact Paths outcome',basis:{source:'Growth <review>',known:[],assumed:[{key:'value',direction:'yes',date:'2026-09-05'}]}};
 const svg=render(model,ctx);assert.match(svg,/Assumed: value=yes @ 2026-09-05/);assert.match(svg,/Growth &lt;review&gt;/);assert.match(svg,/BASIS NOT STATED/);
});
test('selection controls have named keyboard targets and 44px hit areas',()=>{
 const svg=render(parse(DEFAULT_TEXT),ctx,{live:true});
 const controls=[...svg.matchAll(/<g role="button"[^>]*aria-label="([^"]+)"[^>]*><rect[^>]*height="([\d.]+)"/g)];
 assert.ok(controls.length>=6);for(const c of controls)assert.ok(+c[2]>=44);
 assert.doesNotMatch(render(parse(DEFAULT_TEXT),ctx),/data-kind=/);
});
test('hostile source remains escaped text in every view',()=>{
 const source='title: <script>x</script>\nclaim x: <img src=x>\n  detail: '+('W'.repeat(300))+'\noption a: <b>\n  value: <svg>\nreview r: <i>\n  change: <script>unsafe</script>';
 for(const view of ['brief','compare','review']){const svg=render(parse(source+'\nview: '+view),{...ctx,width:390},{live:true});assert.doesNotMatch(svg,/<script>|<img|<b>|<i>/);assert.ok(svg.includes('&lt;script&gt;'));}
});
test('DM Sans and dark theme change the actual renderer',()=>{
 const svg=render(parse(DEFAULT_TEXT+'\nfont: dm-sans'),{...ctx,dark:true});assert.match(svg,/fill="#171A18"/);assert.doesNotMatch(svg,/Instrument Serif/);
});
