import {FILTER_TOOLS, toolId} from '../test-plan.mjs';
import {report} from './_harness.mjs';

// A full run keeps its original assertion floor. A focused run must also prove
// every requested, supported tool reached actual scenario assertions. Unscoped
// metadata checks cannot supply that evidence.
export function createScope(supported, requested = null){
  const expected = requested ? requested.filter(t => supported.includes(t)) : supported;
  if(requested && !expected.length) throw new Error('Selection has no supported browser tools');
  let active = [];
  const counts = Object.fromEntries(expected.map(t => [t, 0]));
  return {
    focused: requested !== null,
    wants(...names){
      const ids = names.map(toolId);
      for(const id of ids) if(!supported.includes(id)) throw new Error('Scope lacks ownership: ' + id);
      active = ids.filter(id => !requested || requested.includes(id));
      return active.length > 0;
    },
    unscoped(){ active = []; },
    checked(){ for(const id of active) counts[id]++; },
    counts,
    validate(){
      const missing = expected.filter(t => !counts[t]);
      if(missing.length) throw new Error('No browser assertions exercised: ' + missing.join(', '));
    },
    report(name, results){
      this.validate();
      console.log('Tool assertion counts: ' + JSON.stringify(counts));
      report(name, {...results, min: requested ? expected.length : results.min});
    },
  };
}
export function scopeFor(suite){
  const requested = process.env.TEST_TOOLS ? JSON.parse(process.env.TEST_TOOLS).map(toolId) : null;
  return createScope(FILTER_TOOLS[suite], requested);
}
