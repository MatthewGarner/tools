/* Cross-tool handoffs are deliberately small, one-way drafts. This registry is
 * a release-quality ledger, not a runtime router: tools retain their own parsers
 * and their own semantic models. Every entry must have a source→target witness
 * in dev/handoff-contracts.test.mjs. */

function deepFreeze(value, seen = new Set()){
  if(value == null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for(const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

const contractList = [
  {
    id: 'map-to-gauge-priors',
    source: 'Map', target: 'Gauge', route: '/map/ → /gauge/',
    action: 'Ask the room for priors', kind: 'draft question set',
    retained: ['flagged assumption wording', 'Map title', 'draft provenance'],
    omitted: ['test result', 'evidence strength', 'Map coordinates and other presets'],
    confirmation: 'A facilitator runs the room session; a Gauge result does not replace a test.',
    returnPath: 'The target URL carries a source-scoped return to the original Map snapshot; target edits do not write back.',
    evidence: 'gauge/tests/handoff.test.mjs',
    callSites: [
      {file:'map/index.html', marker:'id="togauge"'},
      {file:'map/app.js', marker:"handoffHref('/gauge/'"},
    ],
  },
  {
    id: 'gauge-to-fermi-review-needed',
    source: 'Gauge', target: 'Fermi', route: '/gauge/ → /fermi/',
    action: 'Draft Fermi inputs', kind: 'review-needed range inputs',
    retained: ['range bounds', 'question and unit', 'round, response count and pooling receipt'],
    omitted: ['a causal formula', 'calibration claim', 'room identities and live session'],
    confirmation: 'The recipient authors a formula and explicitly adopts or restates each used room range before Fermi simulates it.',
    returnPath: 'The target returns to Gauge without copying the facilitator secret; Fermi edits do not write back.',
    evidence: 'gauge/tests/handoff.test.mjs',
    callSites: [
      {file:'gauge/index.html', marker:'id="tofermi"'},
      {file:'gauge/session.js', marker:"handoffHref('/fermi/'"},
    ],
  },
  {
    id: 'timeline-to-premortem',
    source: 'Timeline', target: 'Premortem', route: '/timeline/ → /premortem/',
    action: 'Premortem this date', kind: 'fresh risk-register frame',
    retained: ['plan title', 'merge-risk deadline', 'draft provenance'],
    omitted: ['schedule model', 'probability forecast', 'saved target record'],
    confirmation: 'The imported frame is saved explicitly as a new Premortem record.',
    returnPath: 'The target URL carries a source-scoped return to the Timeline snapshot and mints a fresh target id.',
    evidence: 'timeline/tests/handoff.test.mjs',
    callSites: [
      {file:'timeline/index.html', marker:'id="topremortem"'},
      {file:'timeline/app.js', marker:"location.href = '/premortem/'"},
    ],
  },
  {
    id: 'roadmap-to-paths-starter',
    source: 'Roadmap', target: 'Paths', route: '/roadmap/ → /paths/',
    action: 'Turn conditional work into a decision-plan starter', kind: 'incomplete decision-plan starter',
    retained: ['horizons', 'work occurrences', 'if/unless direction', 'visible source title'],
    omitted: ['invented question, signal, learning move, evidence standard, owner or due date', 'Roadmap capacity and bet resolution'],
    confirmation: 'Complete every generated decision and its learning contract before treating the starter as a decision plan.',
    returnPath: 'The target URL carries a source-scoped return to the Roadmap snapshot; Paths is a separate URL-local draft.',
    evidence: 'roadmap/tests/handoff-paths.test.mjs',
    callSites: [
      {file:'roadmap/index.html', marker:'id="pathsstarter"'},
      {file:'roadmap/app.js', marker:"handoffHref('/paths/'"},
    ],
  },
  {
    id: 'paths-to-roadmap-projection',
    source: 'Paths', target: 'Roadmap', route: '/paths/ → /roadmap/',
    action: 'Create Roadmap with this basis', kind: 'exact delivery projection',
    retained: ['selected in-plan work', 'known answers with dates', 'explicit assumed answers', 'period order'],
    omitted: ['unselected branches', 'unresolved work', 'dormant or moot decisions', 'Paths decision and learning receipts'],
    confirmation: 'Choose one exact delivery outcome and accept every assumption in its visible basis.',
    returnPath: 'The target URL carries a source-scoped return to Paths; Roadmap remains a separate, visibly based projection.',
    evidence: 'paths/tests/handoff-roadmap.test.mjs',
    callSites: [
      {file:'paths/app.js', marker:"dataset.createRoadmap = ''"},
      {file:'paths/app.js', marker:"handoffHref('/roadmap/'"},
    ],
  },
];

export const HANDOFF_CONTRACTS = deepFreeze(contractList);

export const REQUIRED_CONTRACT_FIELDS = Object.freeze([
  'id', 'source', 'target', 'route', 'action', 'kind', 'retained', 'omitted',
  'confirmation', 'returnPath', 'evidence', 'callSites',
]);

/* This is intentionally independent of the contract list. Source controls mark
 * themselves with data-handoff-contract (including Paths' dynamic control),
 * and the release test discovers those markers from the real UI source. A new
 * visible handoff therefore cannot be hidden by simply forgetting a contract. */
const sourceActionList = [
  {
    contractId: 'map-to-gauge-priors', sourceActionId: 'togauge',
    sourceFile: 'map/index.html', launchFile: 'map/app.js',
    launchMarker: "handoffHref('/gauge/'",
  },
  {
    contractId: 'gauge-to-fermi-review-needed', sourceActionId: 'tofermi',
    sourceFile: 'gauge/index.html', launchFile: 'gauge/session.js',
    launchMarker: "handoffHref('/fermi/'",
  },
  {
    contractId: 'timeline-to-premortem', sourceActionId: 'topremortem',
    sourceFile: 'timeline/index.html', launchFile: 'timeline/app.js',
    launchMarker: "location.href = '/premortem/'",
  },
  {
    contractId: 'roadmap-to-paths-starter', sourceActionId: 'pathsstarter',
    sourceFile: 'roadmap/index.html', launchFile: 'roadmap/app.js',
    launchMarker: "handoffHref('/paths/'",
  },
  {
    contractId: 'paths-to-roadmap-projection', sourceActionId: 'createroadmap',
    sourceFile: 'paths/app.js', launchFile: 'paths/app.js',
    launchMarker: "handoffHref('/roadmap/'",
  },
];

export const HANDOFF_SOURCE_MANIFEST = deepFreeze(sourceActionList);

const TEXT_FIELDS = ['source', 'target', 'route', 'action', 'kind', 'confirmation', 'returnPath', 'evidence'];
const ID = /^[a-z][a-z0-9-]*$/;
const ROUTE = /^\/[a-z-]+\/ → \/[a-z-]+\/$/;
const FILE = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/(?:[a-z0-9-]+)\.(?:js|html)$/;
const MARKER = /^[^\r\n]{1,180}$/;

/** Return structural errors instead of throwing, so the release test says which
 * contractual promise became ill-formed. This remains a test ledger, not a
 * shared handoff runtime. */
export function contractValidationErrors(contract){
  const errors = [];
  if(!contract || typeof contract !== 'object' || Array.isArray(contract)) return ['contract must be an object'];
  for(const field of REQUIRED_CONTRACT_FIELDS) if(!(field in contract)) errors.push(`missing ${field}`);
  if(!ID.test(contract.id || '')) errors.push('id must be a lowercase kebab identifier');
  for(const field of TEXT_FIELDS){
    const value = contract[field];
    if(typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 320)
      errors.push(`${field} must be bounded plain text`);
  }
  if(typeof contract.route === 'string' && !ROUTE.test(contract.route)) errors.push('route must name source and target paths');
  for(const field of ['retained', 'omitted']){
    const values = contract[field];
    if(!Array.isArray(values) || !values.length) { errors.push(`${field} must be a non-empty list`); continue; }
    if(values.some(value => typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 180))
      errors.push(`${field} must contain bounded plain text`);
  }
  if(!Array.isArray(contract.callSites) || !contract.callSites.length) errors.push('callSites must be a non-empty list');
  else for(const site of contract.callSites){
    if(!site || typeof site !== 'object' || Array.isArray(site)) { errors.push('callSites entry must be an object'); continue; }
    if(typeof site.file !== 'string' || !FILE.test(site.file)) errors.push('callSites file must be a tool source path');
    if(typeof site.marker !== 'string' || !MARKER.test(site.marker)) errors.push('callSites marker must be a bounded one-line string');
  }
  return errors;
}

export function contractById(id){
  return HANDOFF_CONTRACTS.find(contract => contract.id === id) || null;
}
