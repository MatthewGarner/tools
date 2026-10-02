export const HORIZON = 30;
export const TICK = 0.25;
export const TEAM_IDS = ['a', 'b', 'c'];
export const TEAM_NAMES = { a: 'Explore', b: 'Build', c: 'Deliver' };
export const CAPABILITIES = [
  { id: 'product', name: 'Product', short: 'P', description: 'Shape the need' },
  { id: 'design', name: 'Design', short: 'D', description: 'Design the experience' },
  { id: 'software', name: 'Software', short: 'S', description: 'Build the behaviour' },
  { id: 'controls', name: 'Controls', short: 'C', description: 'Control the equipment' },
  { id: 'test', name: 'Test', short: 'T', description: 'Verify the result' },
  { id: 'field', name: 'Field', short: 'F', description: 'Learn and commission' },
];
export const DEFAULT_LAYOUT = Object.freeze({ product: 'a', design: 'a', software: 'b', controls: 'b', test: 'c', field: 'c' });
export const DEFAULT_ASSUMPTIONS = Object.freeze({ coordination: 0.05, handoffDelay: 0.75, handoffEffort: 0.15 });
export const FLOWS = {
  feature: { label: 'Product feature', short: 'Feature', stages: [['product', 0.6], ['design', 0.8], ['software', 1.4], ['test', 0.8]] },
  battery: { label: 'Battery control release', short: 'Battery', stages: [['product', 0.5], ['controls', 1.1], ['software', 1.0], ['test', 1.0], ['field', 0.8]] },
  fieldfix: { label: 'Commissioning fix', short: 'Field fix', stages: [['field', 0.7], ['controls', 0.9], ['test', 0.6]] },
};
export const SCENARIOS = {
  rush: { name: 'Product release rush', description: '30 pieces of work arrive over 22 days, mostly product features.', count: 30, spacing: 0.75, seed: 91, weights: [['feature', 0.75], ['battery', 0.15], ['fieldfix', 0.10]] },
  quiet: { name: 'A steadier product flow', description: '12 pieces of work arrive over 22 days. More time between requests.', count: 12, spacing: 2, seed: 91, weights: [['feature', 0.85], ['battery', 0.10], ['fieldfix', 0.05]] },
  battery: { name: 'Battery commissioning', description: '25 releases and field fixes for a fictional battery storage product.', count: 25, spacing: 0.9, seed: 37, weights: [['battery', 0.6], ['fieldfix', 0.4]] },
};

