import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTool} from './new-tool.mjs';
import {definitionMetadata,readExampleState} from '../embed/core/definition.js';
import {applyControl} from '../embed/core/schema.js';
import {fullToolURL,decodeArticleFragment} from '../embed/core/codec.js';
test('a scaffold shares one bounded definition between its full app and article host',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'new-embedded-tool-'));
  try{
    createTool({root,id:'starter',title:'Cost & capacity'});
    const {definition}=await import(pathToFileURL(path.join(root,'embed/definitions/starter.js')));
    definitionMetadata(definition);assert.equal(definition.draft,true);
    const initial=readExampleState(definition,''),changed=applyControl(definition,initial.state,'quantity','20');
    assert.deepEqual(decodeArticleFragment(new URL(fullToolURL(definition,changed)).hash,{tool:'starter'}),changed);
    const result=definition.views.result.render(changed,{width:390,colors:{card:'#fff',ink:'#000',muted:'#444'}});
    assert.match(result.summary,/20 units/);assert.match(result.summary,/500/);
    assert.match(fs.readFileSync(path.join(root,'starter/app.js'),'utf8'),/mode:'tool'/);
    assert.match(fs.readFileSync(path.join(root,'starter/index.html'),'utf8'),/Cost &amp; capacity/);
    assert.throws(()=>createTool({root,id:'starter',title:'Overwrite'}),/replace/);
    assert.throws(()=>createTool({root,id:'../escape',title:'Escape'}),/hyphenated/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
