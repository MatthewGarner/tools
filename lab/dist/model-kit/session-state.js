import {validateState} from '../../../embed/core/schema.js';

export function validateSession(definition, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(raw, 'state') || !Object.hasOwn(raw, 'pinned') || Object.keys(raw).some(key => !['state', 'pinned'].includes(key))) throw Error('Expected an experiment and its comparison.');
  return {state: validateState(definition, structuredClone(raw.state)), pinned: raw.pinned === null ? null : validateState(definition, structuredClone(raw.pinned))};
}

export function readExperiment(definition, route, raw) {
  if (!raw || raw.format !== 'thinking-lab-' + route || raw.version !== 1 || Object.keys(raw).some(key => !['format', 'version', 'state', 'pinned'].includes(key))) throw Error('This file belongs to a different experiment or version.');
  return validateSession(definition, {state:raw.state, pinned:raw.pinned});
}

export function portableExperiment(route, session) {
  return {format:'thinking-lab-' + route, version:1, ...structuredClone(session)};
}
