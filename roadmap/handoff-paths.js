/* Roadmap conditional work -> a fresh Paths decision-plan starter.
   This is intentionally a narrow, reject-by-default handoff. Roadmap knows
   that a fork exists, but it does not know the question, signal, owner or due
   date that would make it a Paths decision. The emitted decisions therefore
   omit all four fields and let Paths' own completion warnings tell the truth. */
const INTRO = '// Generated from Roadmap conditional work. Complete every decision before using this plan.';
/* Kept local on purpose: loading the full Paths parser into Roadmap adds ~22KB
   to every visit merely to repeat the target-parser round trip already enforced
   by this module's tests. These are the target's seven stable document keys;
   the rejection corpus fails if the grammars drift. */
const PATHS_CONFIG_KEYS = ['title', 'date', 'today', 'style', 'verdict', 'palette', 'accent'];
const PATHS_CONFIG = new Set(PATHS_CONFIG_KEYS.map(k => k.toLowerCase()));
const STATUS = new Set(['done', 'doing', 'risk', 'blocked']);

/* These Roadmap warnings describe intact source semantics. Every other
   warning means the parser ignored, repaired or reinterpreted source text, so
   a model-only handoff could silently omit something and must refuse. */
const SAFE_SOURCE_WARNING = [
  /a maybe in the commitment column$/,
  /the condition sits in an earlier horizon than its bet$/,
  /\[done\] item is conditioned on bet .* — done outranks the fork, kept$/,
  /spans need a time axis .* kept as part of the title$/,
  /^group: only affects the register view$/,
];

const keyOf = value => String(value || '').toLowerCase();
const clean = value => typeof value === 'string' && value === value.trim() && value.length > 0;
const hasSyntaxDelimiter = value => /[\r\n\t\[\]]|(?:^|\s)\/\/|\s->\s/.test(value);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function sourceWarningsAreLossless(model){
  return Array.isArray(model.warnings) && model.warnings.every(warning =>
    SAFE_SOURCE_WARNING.some(pattern => pattern.test(String(warning))));
}

function starterTitle(model){
  if(model.title === '') return 'Roadmap conditional work — decision-plan starter';
  if(!clean(model.title) || /[\r\n\t]|(?:^|\s)\/\//.test(model.title)) return null;
  return `${model.title} — decision-plan starter`;
}

function safePeriod(name){
  if(!clean(name) || hasSyntaxDelimiter(name) || /:$/.test(name) || /^decision/i.test(name)) return false;
  return !new RegExp(`^(?:${PATHS_CONFIG_KEYS.join('|')})\\s*:`, 'i').test(name);
}

function safeText(value, {lane = false} = {}){
  if(lane && value === '') return true;
  if(!clean(value) || hasSyntaxDelimiter(value)) return false;
  if(lane && (value.includes(':') || PATHS_CONFIG.has(value.toLowerCase()))) return false;
  return !/\s--\s/.test(value);
}

function safeNote(value){
  return value === '' || (typeof value === 'string' && value === value.trim() &&
    !hasSyntaxDelimiter(value) && !/[\r\n\t\[\]]/.test(value));
}

function safeUrl(value){
  return value == null || (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value) &&
    !/[\r\n\t\[\]]/.test(value));
}

function orderedForks(model){
  return Object.entries(model.bets)
    .sort(([, a], [, b]) => a.srcLine - b.srcLine);
}

function directDependents(model, nameLc){
  return model.items.filter(item => item.cond && keyOf(item.cond.name) === nameLc);
}

function safeForks(model){
  const forks = orderedForks(model);
  if(!forks.length) return null;

  for(const [nameLc, fork] of forks){
    if(!isRecord(fork) || !Number.isInteger(fork.srcLine) || !Number.isInteger(fork.itemIndex)) return null;
    const declarations = model.items.filter(item => item.bet && keyOf(item.bet.name) === nameLc);
    if(declarations.length !== 1) return null;                       // non-canonical/conflicting
    const declaring = model.items[fork.itemIndex];
    if(!declaring || declaring !== declarations[0]) return null;
    if(fork.outcome != null || fork.effective !== 'unresolved' || fork.cycle) return null;
    if(declaring.cond) return null;                                  // a decision chain
    const dependents = directDependents(model, nameLc);
    if(!dependents.some(item => item.status !== 'done')) return null;
  }

  /* A conditioned fork declaration is a chain even when it points at a fork
     outside the candidate set. In-flight conditional work is also unsafe:
     either Paths branch could say the work should not exist while it is
     already underway. */
  if(model.items.some(item => item.bet && item.cond)) return null;
  if(model.items.some(item => item.cond && item.status === 'doing')) return null;
  return forks;
}

function safeStructure(model){
  if(!isRecord(model) || !Array.isArray(model.horizons) || !Array.isArray(model.items) ||
     !isRecord(model.bets) || starterTitle(model) === null) return false;
  /* A Paths-sourced delivery projection is not a fresh Roadmap-local decision
     model. Re-handing it to Paths without a deliberate provenance mapping
     would manufacture a loop and relabel assumptions as new questions. */
  if(model.basis != null) return false;
  if(!sourceWarningsAreLossless(model)) return false;
  if(model.horizons.length < 1 || !model.horizons.every(safePeriod)) return false;
  if(new Set(model.horizons.map(keyOf)).size !== model.horizons.length) return false;

  let lastH = -1;
  for(const item of model.items){
    if(!isRecord(item)) return false;
    if(!Number.isInteger(item.h) || item.h < 0 || item.h >= model.horizons.length || item.h < lastH) return false;
    lastH = item.h;                                                  // preserve global occurrence order
    if(!safeText(item.lane, {lane:true}) || !safeText(item.title)) return false;
    if(!safeNote(item.note || '') || !safeUrl(item.url)) return false;
    if(item.status != null && !STATUS.has(item.status)) return false;
    if((item.declaredSpan || item.span || 1) !== 1 || item.spanEnd != null) return false;
    if(item.cond && (!isRecord(item.cond) || !/^(if|unless)$/.test(item.cond.when) || !/^[a-z0-9-]+$/i.test(item.cond.name))) return false;
    if(item.bet && (!isRecord(item.bet) || !/^[a-z0-9-]+$/i.test(item.bet.name))) return false;
  }
  return true;
}

function itemLine(item){
  const tags = [];
  if(item.status) tags.push(`[${item.status}]`);
  if(item.cond) tags.push(`[${item.cond.when} ${item.cond.name}]`);
  let line = item.lane ? `  ${item.lane}: ${item.title}` : `  ${item.title}`;
  if(tags.length) line += ' ' + tags.join(' ');
  if(item.note) line += ' -- ' + item.note;
  if(item.url) line += ' -> ' + item.url;
  return line;
}

export function roadmapToPathsStarter(model){
  if(!safeStructure(model)) return null;
  const forks = safeForks(model);
  if(!forks) return null;

  const lines = [INTRO, `title: ${starterTitle(model)}`, ''];
  for(const [, fork] of forks) lines.push(`decision ${fork.display}:`);
  lines.push('');
  for(let h = 0; h < model.horizons.length; h++){
    lines.push(model.horizons[h]);
    for(const item of model.items) if(item.h === h) lines.push(itemLine(item));
  }
  return lines.join('\n');
}

export function roadmapConditionalityHealth(model){
  const sourceItems = isRecord(model) && Array.isArray(model.items) ? model.items : [];
  const sourceBets = isRecord(model) && isRecord(model.bets) ? model.bets : {};
  const open = new Set(Object.entries(sourceBets)
    .filter(([, fork]) => isRecord(fork) && fork.effective === 'unresolved' && !fork.cycle)
    .map(([name]) => name));
  const items = sourceItems.filter(item => isRecord(item) && item.status !== 'done' && isRecord(item.cond) &&
    open.has(keyOf(item.cond.name)));
  const forks = new Set(items.map(item => keyOf(item.cond.name))).size;
  const count = items.length;
  const message = count === 0
    ? 'No unfinished delivery items are directly conditional on open forks.'
    : `${count} unfinished delivery ${count === 1 ? 'item is' : 'items are'} directly conditional on ${forks} open ${forks === 1 ? 'fork' : 'forks'}.`;
  return {items:count, forks, message, starter:roadmapToPathsStarter(model)};
}
