/* Seed data for /rank, kept pure so a node test can assert the DEFAULT example
   actually demonstrates the mechanism on first load (a live re-sort + at least one
   knife-edge), not the 3 identical blank rows it used to open with — which could
   never re-sort under a weight drag, hiding the whole point of the tool. */

// The default weights the app opens with (WSJF-style: benefit criteria ÷ effort).
// Exported so the invariant test scores the default example under the SAME weights
// the user sees, not a re-guessed copy.
export const DEFAULT_CRITERIA = [
  {name: 'Value', w: 3},
  {name: 'Time criticality', w: 2},
  {name: 'Risk reduction', w: 1},
];
export const DEFAULT_EFFORT = {name: 'Effort', w: 1};

// Each item: [name, Value, Time criticality, Risk reduction, Effort] (scores 1–10).
// EXAMPLES[0] is BOTH the first chip and the first-load seed, so what you land on is
// a real, quotable prioritisation — Habitat (the house example) feature backlog with a
// settled top two and a genuine knife-edge for the third slot.
export const EXAMPLES = [
  {name: 'Habitat feature backlog', k: 3, items: [
    ['Streak recovery',      8, 8, 6, 4],   // robust #1
    ['Smart reminders',      7, 6, 5, 4],   // robust #2
    ['Home widget',          9, 3, 5, 5],   // knife-edge for the 3rd slot (Value-leaning)
    ['Friend challenges',    5, 9, 4, 5],   // knife-edge for the 3rd slot (Time-leaning)
    ['Onboarding redesign',  4, 3, 6, 7],   // robust last
  ]},
  {name: 'Ops & infra backlog', k: 3, items: [
    ['Incident response automation',    8, 7, 6, 6],
    ['Observability dashboard overhaul', 7, 5, 5, 5],
    ['Legacy job scheduler migration',  6, 4, 8, 8],
    ['Cloud cost reporting',            4, 6, 3, 3],
    ['Disaster recovery drill tooling', 5, 3, 9, 8],
    ['Access control audit',            6, 8, 6, 4],
    ['Internal API gateway rewrite',    7, 6, 5, 5],
  ]},
  {name: 'Classic product backlog', k: 3, items: [
    ['Onboarding revamp',    8, 5, 3, 5],
    ['Enterprise SSO',       6, 8, 4, 4],
    ['Mobile app parity',    7, 4, 3, 9],
    ['Billing self-serve',   5, 6, 5, 4],
    ['Analytics dashboard',  6, 3, 4, 6],
    ['API rate-limit tier',  4, 7, 6, 3],
  ]},
];
