/* Public catalogue metadata. Model state and storage never enter discovery URLs. */
export const DOMAINS = { product: 'Product', energy: 'Energy', teams: 'Teams & organisations', systems: 'Systems', ideas: 'Ideas' };
export const TYPES = { artefact: 'Artefact', calculator: 'Calculator', model: 'Model', workshop: 'Workshop', scaffold: 'Scaffold', binder: 'Binder' };
export const MATURITIES = { established: 'Established', experimental: 'Experimental', archived: 'Archived' };

const product = [
  ['roadmap', 'Roadmap', 'Arrange work across now, next and later, set WIP limits, and export the plan.', 'artefact', 'planning priorities portfolio'],
  ['timeline', 'Timeline', 'Map milestones, uncertainty ranges and dependencies; compare how the plan has moved.', 'artefact', 'planning dates p50 p90 risk'],
  ['bets', 'Bets', 'Compare stakes, odds and payoffs across a portfolio of bets.', 'artefact', 'probability expected value concentration'],
  ['rank', 'Rank', 'Rank options against weighted criteria and see whether the order survives uncertainty.', 'calculator', 'prioritisation priorities decision sensitivity'],
  ['duel', 'Duel', 'Compare options in pairs when a list is too long to rank in one pass.', 'workshop', 'prioritisation priorities pairwise'],
  ['map', 'Map', 'Place a portfolio on two axes and explore what different positions mean.', 'artefact', 'matrix quadrants prioritisation'],
  ['tree', 'Tree', 'Draw a decision tree with probabilities and expected values carried up its branches.', 'artefact', 'decision uncertainty risk'],
  ['why', 'Why', 'Connect outcomes, assumptions and solutions to expose the argument behind a plan.', 'artefact', 'strategy evidence outcomes'],
  ['wardley', 'Wardley', 'Map a value chain and its evolution to explore what to build, buy or commoditise.', 'artefact', 'strategy dependency mapping'],
  ['premortem', 'Premortem', 'Write the failure story, estimate its risks and decide which ones need action.', 'workshop', 'risk expected value register'],
  ['fermi', 'Fermi', 'Build a driver-tree estimate with ranges and see which assumptions matter.', 'calculator', 'estimation uncertainty sensitivity'],
  ['gauge', 'Gauge', 'Collect independent estimates, compare ranges and run another round.', 'workshop', 'delphi estimation calibration group'],
  ['alarm', 'Alarm', 'Explore how base rates change the meaning of a supposedly accurate alarm.', 'model', 'probability false positives monitoring bayes'],
  ['flow', 'Flow', 'Explore the relationship between work in progress, throughput and waiting time.', 'model', 'queues capacity little law'],
  ['signal-vs-noise', 'Signal vs noise', 'Respond to noisy results and see how interventions can amplify the variation.', 'model', 'deming tampering regression mean'],
  ['paths', 'Paths', 'Map the questions inside a plan, what their answers buy and what happens either way.', 'artefact', 'decision learning uncertainty options'],
  ['proxy', 'Proxy Hunt', 'Stress-test whether pressure on a metric can harm the outcomes it is meant to serve.', 'artefact', 'measurement incentives goodhart'],
  ['case', 'Case file', 'Bring tool links, a decision question and a verdict together in one case.', 'binder', 'evidence decision exhibits'],
].map(([route, title, description, type, keywords]) => ({ id: `product:${route}`, route, title, description, type, keywords, domains: ['alarm','flow','signal-vs-noise','why','wardley'].includes(route)?['product','systems']:['product'], maturity: 'established', status: 'active', source: 'product' }));

const energy = [
  ['cycles', 'Cycle budget', 'Explore a battery’s warranty budget and the value of cycles across three horizons.', 'calculator', 'battery bess degradation storage warranty'],
  ['risk', 'Risk transfer', 'Compare merchant, floor, toll and insured payoffs across the same uncertain year.', 'model', 'battery bess revenue contract route market'],
  ['frequency', 'Frequency & inertia', 'Trip a generator and explore inertia, rate of change of frequency and battery response.', 'model', 'battery bess grid rocof response'],
  ['merit-order', 'Merit order', 'Stack generators by cost, move demand and see which plant sets the clearing price.', 'model', 'electricity market dispatch supply'],
  ['intraday', 'A day through the stack', 'Play a day through the merit order and see how storage changes its price shape.', 'model', 'battery bess electricity market storage dispatch'],
].map(([route, title, description, type, keywords]) => ({ id: `energy:${route}`, route, title, description, type, keywords, domains: ['energy'], maturity: 'established', status: 'active', source: 'energy' }));

// lab-catalogue:start
const lab = [
  {
    "id": "lab:commitment",
    "route": "commitment",
    "title": "The commitment spiral",
    "description": "Can a team promise its way into losing the ability to deliver?",
    "type": "model",
    "keywords": "commitment Demand → pressure → rework",
    "domains": [
      "teams",
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:teams",
    "route": "teams",
    "title": "How teams fit the work",
    "description": "Move capabilities across team boundaries. Watch the work find a different route.",
    "type": "model",
    "keywords": "teams Capability → boundary → work",
    "domains": [
      "teams"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:exploration",
    "route": "exploration",
    "title": "Exploration versus delivery",
    "description": "Spend limited effort learning about the problem or building a response.",
    "type": "model",
    "keywords": "exploration LEARN / BUILD",
    "domains": [
      "product",
      "teams"
    ],
    "maturity": "archived",
    "status": "archived",
    "source": "lab",
    "archiveReason": "This allocation model is being reconsidered around hypotheses and evidence."
  },
  {
    "id": "lab:flexibility",
    "route": "flexibility",
    "title": "Where flexibility gets trapped",
    "description": "Make battery commitments before you know what comes next.",
    "type": "model",
    "keywords": "flexibility Power · energy · promises battery bess decisions energy",
    "domains": [
      "energy",
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:delay",
    "route": "delay",
    "title": "Steering through delay",
    "description": "Keep a system steady while your instrument reports an earlier state.",
    "type": "model",
    "keywords": "delay Move now → see later",
    "domains": [
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:exceptions",
    "route": "exceptions",
    "title": "How exceptions accumulate",
    "description": "Accept a useful exception. Follow what it asks of the system later.",
    "type": "model",
    "keywords": "exceptions TAILORED → STANDARD → RETIRED",
    "domains": [
      "teams",
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:knowledge",
    "route": "knowledge",
    "title": "Specialists and shared knowledge",
    "description": "Move a coaching period before or after a specialist becomes unavailable.",
    "type": "model",
    "keywords": "knowledge Coach now / capacity later",
    "domains": [
      "teams"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:local",
    "route": "local",
    "title": "Local wins, collective losses",
    "description": "Change one team’s action and watch who absorbs the consequences.",
    "type": "model",
    "keywords": "local OWN / SHARED / EFFECTS",
    "domains": [
      "teams",
      "systems"
    ],
    "maturity": "archived",
    "status": "archived",
    "source": "lab",
    "archiveReason": "The fixed payoff assumptions carry too much of the lesson in this version."
  },
  {
    "id": "lab:predictions",
    "route": "predictions",
    "title": "When predictions change behaviour",
    "description": "A shared forecast changes the behaviour that produces its target.",
    "type": "model",
    "keywords": "predictions FORECAST → RESPONSE → PRICE",
    "domains": [
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:accuracy",
    "route": "accuracy",
    "title": "Accurate enough for which decision?",
    "description": "Keep the headline forecast accuracy. Change the decisions it produces.",
    "type": "model",
    "keywords": "accuracy SAME ERRORS / DIFFERENT LOSS battery bess decisions energy",
    "domains": [
      "energy",
      "product"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:reliability",
    "route": "reliability",
    "title": "Almost reliable parts",
    "description": "Build a dependency map. Find what a backup really protects you from.",
    "type": "model",
    "keywords": "reliability Primary + backup → service",
    "domains": [
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:adoption",
    "route": "adoption",
    "title": "Crossing the adoption gap",
    "description": "A change may be useful only once enough other people use it.",
    "type": "model",
    "keywords": "adoption WHO SWITCHES FIRST?",
    "domains": [
      "product",
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:reframe",
    "route": "reframe",
    "title": "Reframing workbench",
    "description": "Describe the same problem differently. Notice what you would do next.",
    "type": "scaffold",
    "keywords": "reframe One situation / several frames",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:mixer",
    "route": "mixer",
    "title": "Possibility mixer",
    "description": "Combine ingredients, map your concepts, and investigate spaces you have not explored.",
    "type": "scaffold",
    "keywords": "mixer COMBINE → MAP → DEVELOP",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:constraints",
    "route": "constraints",
    "title": "Constraint playground",
    "description": "Change a limit in your imagination. Bring the useful part back to reality.",
    "type": "scaffold",
    "keywords": "constraints REMOVE / REVERSE / EXAGGERATE",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:analogy",
    "route": "analogy",
    "title": "Analogy workshop",
    "description": "Borrow a mechanism from somewhere else. Find where the comparison breaks.",
    "type": "scaffold",
    "keywords": "analogy Source ↔ situation",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:interventions",
    "route": "interventions",
    "title": "Intervention workbench",
    "description": "Which causal relationship would you change, and what would you expect to observe?",
    "type": "scaffold",
    "keywords": "interventions CLAIM → TEST → LEARN",
    "domains": [
      "ideas",
      "systems"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:answers",
    "route": "answers",
    "title": "Three genuinely different answers",
    "description": "Generate alternatives with different mechanisms before comparing them.",
    "type": "scaffold",
    "keywords": "answers ANSWER A / B / WILDCARD",
    "domains": [
      "ideas"
    ],
    "maturity": "archived",
    "status": "merged",
    "source": "lab",
    "archiveReason": "Three Answers now shares alternatives, borrowed strengths and comparison criteria in the Alternatives workbench.",
    "mergedInto": "objections"
  },
  {
    "id": "lab:objections",
    "route": "objections",
    "title": "Alternatives workbench",
    "description": "Start with an idea, an objection or a disagreement. Compare different ways to make it work.",
    "type": "scaffold",
    "keywords": "objections OPTIONS → COMPARE → TEST",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:territory",
    "route": "territory",
    "title": "Unexplored territory",
    "description": "Map ideas by needs and mechanisms. Investigate empty combinations.",
    "type": "scaffold",
    "keywords": "territory NEEDS × MECHANISMS",
    "domains": [
      "ideas"
    ],
    "maturity": "archived",
    "status": "merged",
    "source": "lab",
    "archiveReason": "Territory now maps the same concepts that you generate and develop in Possibility mixer.",
    "mergedInto": "mixer"
  },
  {
    "id": "lab:scenes",
    "route": "scenes",
    "title": "Scene-first invention",
    "description": "Invent for a person at a particular moment, with partial information.",
    "type": "scaffold",
    "keywords": "scenes BEFORE → MOMENT → AFTER",
    "domains": [
      "ideas"
    ],
    "maturity": "experimental",
    "status": "active",
    "source": "lab"
  },
  {
    "id": "lab:family",
    "route": "family",
    "title": "Idea family tree",
    "description": "Keep alternatives connected without losing their differences.",
    "type": "scaffold",
    "keywords": "family PARENT → BRANCH → COMBINATION",
    "domains": [
      "ideas"
    ],
    "maturity": "archived",
    "status": "merged",
    "source": "lab",
    "archiveReason": "Branching and ancestry now live inside the working tools. Copy Family Tree work into Alternatives to keep developing its branches.",
    "mergedInto": "objections"
  },
  {
    "id": "lab:questions",
    "route": "questions",
    "title": "Questions before answers",
    "description": "Expand the questions that could open different approaches.",
    "type": "scaffold",
    "keywords": "questions FACT / CAUSE / VALUE / DESIGN",
    "domains": [
      "ideas"
    ],
    "maturity": "archived",
    "status": "merged",
    "source": "lab",
    "archiveReason": "Questions now connect directly to frames in the Reframing workbench.",
    "mergedInto": "reframe"
  },
  {
    "id": "lab:disagreement",
    "route": "disagreement",
    "title": "Productive disagreement",
    "description": "Protect the useful intentions inside two opposing proposals.",
    "type": "scaffold",
    "keywords": "disagreement TWO BENEFITS / A NEW APPROACH",
    "domains": [
      "ideas"
    ],
    "maturity": "archived",
    "status": "merged",
    "source": "lab",
    "archiveReason": "Disagreement now carries protected intentions into the shared Alternatives workbench.",
    "mergedInto": "objections"
  }
];
// lab-catalogue:end

export const SUITE_CATALOG = [...product, ...energy, ...lab];
export const DEFAULT_FILTERS = Object.freeze({ q: '', domain: '', type: '', maturity: '' });

export function normaliseText(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/[’‘]/g, "'");
}

export function parseFilters(search = '') {
  const params = new URLSearchParams(search);
  const member = (name, choices) => Object.hasOwn(choices, params.get(name)) ? params.get(name) : '';
  return { q: (params.get('q') ?? '').slice(0, 200), domain: member('domain', DOMAINS), type: member('type', TYPES), maturity: member('maturity', MATURITIES) };
}

export function filtersToSearch(filters, search = '') {
  const params = new URLSearchParams(search);
  const safe = parseFilters(new URLSearchParams(filters));
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    const value = safe[key].trim();
    if (value) params.set(key, value); else params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function filterCatalog(filters = DEFAULT_FILTERS, entries = SUITE_CATALOG) {
  const safe = parseFilters(new URLSearchParams(filters));
  const terms = normaliseText(safe.q).trim().split(/\s+/).filter(Boolean);
  return entries.filter(tool => {
    if (safe.domain && !tool.domains.includes(safe.domain)) return false;
    if (safe.type && tool.type !== safe.type) return false;
    if (safe.maturity ? tool.maturity !== safe.maturity : tool.maturity === 'archived') return false;
    const text = normaliseText([tool.title, tool.description, tool.keywords, ...tool.domains.map(c => DOMAINS[c]), TYPES[tool.type]].join(' '));
    return terms.every(term => text.includes(term));
  });
}

// Energy keeps its established host-local routes. Previews always stay local.
export function toolHref(tool, hostname = '') {
  const prefix = tool.source === 'lab' ? '/lab/' : tool.source === 'energy' && hostname !== 'energy.matthewgarner.me' ? '/energy/' : '/';
  return `${prefix}${tool.route}/`;
}
