/* FAMILIES (dev/tool-dirs.mjs) is a claim, not just data: every shipped
   tool belongs to exactly one of the four families. Without this guard a
   new tool can go unclassified indefinitely — the same drift TOOL_DIRS
   itself was built to stop. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_DIRS, FAMILIES} from './tool-dirs.mjs';

test('every tool belongs to exactly one family', () => {
  const seen = new Map();
  for(const [family, dirs] of Object.entries(FAMILIES))
    for(const dir of dirs){
      assert.ok(!seen.has(dir), `${dir} is listed in both "${seen.get(dir)}" and "${family}"`);
      seen.set(dir, family);
    }
  for(const dir of TOOL_DIRS)
    assert.ok(seen.has(dir), `${dir} is in TOOL_DIRS but has no family`);
  for(const dir of seen.keys())
    assert.ok(TOOL_DIRS.includes(dir), `${dir} has a family but is not in TOOL_DIRS`);
});
