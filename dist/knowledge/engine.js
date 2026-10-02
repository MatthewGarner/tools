export const WEEKS = 24;
export const PEOPLE = ['Ari', 'Bea', 'Chen', 'Drew'];
export const SKILLS = [{ id: 'interface', name: 'Interface' }, { id: 'controls', name: 'Controls' }, { id: 'verification', name: 'Verification' }];
export const INITIAL_SKILLS = [[1, 0.15, 0.25], [0.2, 1, 0.15], [0.2, 0.2, 1], [0.45, 0.35, 0.35]];
export const SCENARIOS = { product: { name: 'Product delivery', seed: 23, demand: [1.35, 1.05, 1.0] }, battery: { name: 'Battery commissioning', seed: 61, demand: [0.35, 1.55, 1.4] }, pivot: { name: 'The work changes', seed: 47, demand: [1.6, 0.65, 0.95] } };
export const DEFAULT_TRAINING = { enabled: true, mentor: 1, learner: 3, skill: 1, start: 2, duration: 6, fraction: 0.35 };
export const DEFAULT_ABSENCE = { person: 1, from: 12 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function normalizeSkills(raw) { return PEOPLE.map((_, p) => SKILLS.map((_, s) => clamp(Number.isFinite(raw?.[p]?.[s]) ? raw[p][s] : INITIAL_SKILLS[p][s], 0, 1))); }
export function normalizeTraining(raw = {}) { const integer = (key, min, max) => clamp(Number.isInteger(raw?.[key]) ? raw[key] : DEFAULT_TRAINING[key], min, max); const duration = integer('duration', 2, 10); return { enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true, mentor: integer('mentor', 0, 3), learner: integer('learner', 0, 3), skill: integer('skill', 0, 2), start: integer('start', 1, WEEKS - duration + 1), duration, fraction: clamp(Number.isFinite(raw.fraction) ? raw.fraction : 0.35, 0.1, 0.6) }; }
export function demandFor(scenario, week) { const context = SCENARIOS[scenario] || SCENARIOS.product; const base = scenario === 'pivot' && week >= 11 ? [0.4, 1.65, 1.15] : context.demand; return base.map((value, s) => { let x = Math.imul(context.seed + week * 911 + s * 67, 1597334677); const noise = ((x ^ x >>> 15) >>> 0) / 4294967296; return value * (0.9 + 0.2 * noise); }); }
export function workloadFor(scenario='battery'){const before=[...(SCENARIOS[scenario]||SCENARIOS.battery).demand];return {before,after:scenario==='pivot'?[0.4,1.65,1.15]:[...before],changeWeek:scenario==='pivot'?11:25};}
export function simulate({ skills = INITIAL_SKILLS, training = DEFAULT_TRAINING, sessions, focus = [-1, -1, -1, -1], absence = DEFAULT_ABSENCE, absences, workload, scenario = 'battery' } = {}) {
  const levels = normalizeSkills(skills), plan = normalizeTraining(training);
  const plans = (sessions ?? [{...plan,id:'legacy'}]).map((p,i)=>({...normalizeTraining(p),id:p.id||`session-${i}`}));
  const away = absences ?? (absence.person < 0 || absence.from > 24 ? [] : [{...absence,to:24}]);
  const demandPlan = workload ?? workloadFor(scenario);
  const assignments = PEOPLE.map((_, i) => Number.isInteger(focus?.[i]) && focus[i] >= 0 && focus[i] <= 2 ? focus[i] : -1);
  const missing = { person: Number.isInteger(absence?.person) ? clamp(absence.person, -1, 3) : 1, from: Number.isInteger(absence?.from) ? clamp(absence.from, 1, 25) : 12 };
  let backlog = [0, 0, 0], delivered = 0, arrived = 0, learningTime = 0;
  const history = [];
  for (let week = 1; week <= WEEKS; week++) {
    const demand = demandFor(scenario, week).map((v,j)=>{const old=(scenario==='pivot'&&week>=11?[0.4,1.65,1.15]:(SCENARIOS[scenario]||SCENARIOS.product).demand)[j];return v/old*(week>=demandPlan.changeWeek?demandPlan.after: demandPlan.before)[j];}); demand.forEach((value, s) => { backlog[s] += value; arrived += value; });
    const present = PEOPLE.map((_, p) => !away.some(a=>a.person===p&&week>=a.from&&week<=a.to));
    const available = present.map(value => value ? 1 : 0);
    const before = structuredClone(levels), allocations = [], output = [0, 0, 0];
    const coachingEvents = plans.filter(p=>p.enabled&&week>=p.start&&week<p.start+p.duration).map(p=>({ ...p, actual:0, gain:0, blocked: p.mentor===p.learner ? 'Same person' : !present[p.mentor]||!present[p.learner] ? 'Participant away' : '' }));
    const requested = PEOPLE.map((_,p)=>coachingEvents.filter(e=>!e.blocked&&(e.mentor===p||e.learner===p)).reduce((n,e)=>n+e.fraction,0));
    const coachingTime = PEOPLE.map(()=>0);
    // All requests see the same start-of-week capacity. Scale each session by
    // its more constrained participant; never allocate one person's time twice.
    for (const event of coachingEvents) if(!event.blocked){
      event.actual=event.fraction*Math.min(1,1/requested[event.mentor],1/requested[event.learner]);
      event.limited=event.actual+1e-9<event.fraction;
      for(const p of [event.mentor,event.learner]){available[p]-=event.actual;coachingTime[p]+=event.actual;}
      learningTime+=2*event.actual;
    }
    const coaching=coachingEvents.some(e=>e.actual>0);
    const capacity = [...available];
    // Allocate scarce person-time to the most proficient eligible person/skill
    // pair first. A person may use leftover time elsewhere, never twice.
    for (let guard = 0; guard < 20; guard++) {
      let best = null;
      PEOPLE.forEach((_, p) => SKILLS.forEach((__, s) => { if (available[p] > 1e-9 && backlog[s] > 1e-9 && levels[p][s] > 0 && (assignments[p] === -1 || assignments[p] === s)) { const candidate = { p, s, proficiency: levels[p][s] }; if (!best || candidate.proficiency > best.proficiency || candidate.proficiency === best.proficiency && backlog[s] > backlog[best.s]) best = candidate; } }));
      if (!best) break;
      const time = Math.min(available[best.p], backlog[best.s] / best.proficiency), amount = time * best.proficiency;
      available[best.p] -= time; backlog[best.s] -= amount; output[best.s] += amount; delivered += amount;
      allocations.push({ person: best.p, skill: best.s, time, output: amount });
    }
    // Learning is credited at week end; it cannot increase this week's output.
    for (const allocation of allocations) levels[allocation.person][allocation.skill] += 0.015 * allocation.time * (1 - levels[allocation.person][allocation.skill]);
    let coachingGain = 0;
    for(const event of coachingEvents) if(event.actual>0){
      event.gain=0.65*event.actual*Math.max(0,before[event.mentor][event.skill]-before[event.learner][event.skill]);
      levels[event.learner][event.skill]=Math.min(1,levels[event.learner][event.skill]+event.gain);
      coachingGain+=event.gain;
    }
    history.push({ week, demand, arrived, output, delivered, backlog: [...backlog], totalBacklog: backlog.reduce((a, b) => a + b, 0), levels: structuredClone(levels), before, present, capacity, idle: [...available], allocations, coaching, coachingGain, learningTime, coachingEvents, coachingTime, blockedCoaching: coachingEvents.some(e=>e.blocked) });
  }
  return { scenario, skills: normalizeSkills(skills), training: plan, focus: assignments, absence: missing, sessions: plans, absences: away, workload: demandPlan, history, final: history.at(-1) };
}
