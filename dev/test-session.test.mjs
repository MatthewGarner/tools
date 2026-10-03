import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {startServer} from './pw/session.mjs';

test('overlapping sessions own different origins; stopping one leaves the other intact', async () => {
  const first=await startServer(), second=await startServer();
  try{
    assert.notEqual(first.port,second.port);
    assert.ok((await fetch(first.base+'/rank/')).ok);
    assert.ok((await fetch(second.base+'/rank/')).ok);
    const stopped=once(first.child,'close'); first.stop(); await stopped;
    await assert.rejects(fetch(first.base));
    assert.ok((await fetch(second.base+'/rank/')).ok);
  }finally{first.stop();second.stop();}
});
test('an occupied explicit port fails rather than using an unrelated server', async () => {
  const first=await startServer();
  try{
    await assert.rejects(startServer('dev/serve.mjs',{port:first.port}),/exited/);
    assert.ok((await fetch(first.base)).ok);
  }finally{first.stop();}
});
test('concurrent relay suites receive independent ephemeral servers', async () => {
  const first=await startServer('dev/gauge-dev.mjs'), second=await startServer('dev/gauge-dev.mjs');
  try{
    assert.notEqual(first.port,second.port);
    for(const server of [first,second]) assert.ok((await fetch(server.base+'/gauge/')).ok);
  }finally{first.stop();second.stop();}
});
