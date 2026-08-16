/* Canonical high-risk planning states. These fixtures deliberately live beside
 * Paths tests so a future Learning Agenda can inherit them instead of building
 * a friendlier-but-less-honest model of uncertainty. */

const decision = (name, fields = '') => `decision ${name}:
  question: ${name}?
  signal: pilot evidence
  owner: Alex
  answer-by: 2026-08-10${fields}`;

const document = (head, work = '  Growth: Expansion [if price]') =>
  `title: Lantern
${head}
Now
  Core: Foundation
Next
${work}`;

export const PATHS_SEMANTIC_STRESS = Object.freeze([
  {
    id: 'unanswered',
    meaning: 'An open question becomes an explicit temporary assumption only after an exact outcome is chosen.',
    text: document(decision('price')),
    answers: {price:'yes'},
    receipt: {known:[], assumed:[{key:'price', direction:'yes', date:'2026-08-12'}]},
    targetItems:['Foundation', 'Expansion'], absentItems:[],
  },
  {
    id: 'assumed',
    meaning: 'An authored Paths assumption is not knowledge in a delivery projection.',
    text: document(decision('price', '\n  assume: no 2026-08-09')),
    answers: {price:'no'},
    receipt: {known:[], assumed:[{key:'price', direction:'no', date:'2026-08-12'}]},
    targetItems:['Foundation'], absentItems:['Expansion'],
  },
  {
    id: 'authored-assume-without-injected-answer',
    meaning: 'An authored Paths assumption cannot silently become a Roadmap delivery basis without selecting an exact outcome.',
    text: document(decision('price', '\n  assume: no 2026-08-09')),
    answers: {}, refusal: 'stale-assignment',
  },
  {
    id: 'answered',
    meaning: 'A dated authored answer is visible as known, never relabelled as an assumption.',
    text: document(decision('price', '\n  answer: yes 2026-08-09')),
    answers: {},
    receipt: {known:[{key:'price', direction:'yes', date:'2026-08-09'}], assumed:[]},
    targetItems:['Foundation', 'Expansion'], absentItems:[],
  },
  {
    id: 'gated',
    meaning: 'A dependent question can become active only after its opening condition is met.',
    text: document(`${decision('host')}\n${decision('price', '\n  when: host')}`,
      '  Growth: Host route [if host]\n  Growth: Price expansion [if price]'),
    answers: {host:'yes', price:'no'},
    receipt: {known:[], assumed:[
      {key:'host', direction:'yes', date:'2026-08-12'},
      {key:'price', direction:'no', date:'2026-08-12'},
    ]},
    targetItems:['Foundation', 'Host route'], absentItems:['Price expansion'],
  },
  {
    id: 'moot',
    meaning: 'A question that never opened is omitted, while its answered gate remains visible.',
    text: document(`${decision('host')}\n${decision('price', '\n  when: host')}`,
      '  Growth: Host route [if host]\n  Growth: Price expansion [if price]'),
    answers: {host:'no', price:'yes'},
    receipt: {known:[], assumed:[{key:'host', direction:'no', date:'2026-08-12'}]},
    omitted: 'price',
    targetItems:['Foundation'], absentItems:['Host route', 'Price expansion'],
  },
  {
    id: 'contradictory',
    meaning: 'Conflicting authored answers refuse a projection rather than being repaired into a world.',
    text: document(decision('price', '\n  answer: yes 2026-08-09\n  answer: no 2026-08-09')),
    answers: {}, refusal: 'stale-assignment',
  },
  {
    id: 'cyclic',
    meaning: 'Cyclic decision availability refuses instead of guessing an order.',
    text: document(`${decision('price', '\n  when: group')}\n${decision('group', '\n  when: price')}`),
    answers: {price:'yes', group:'yes'}, refusal: 'invalid-source-model',
  },
  {
    id: 'malformed',
    meaning: 'Malformed conditional syntax refuses rather than shedding the conditional work.',
    text: document(`${decision('price', '\n  when: host and')}\n${decision('host')}`),
    answers: {price:'yes', host:'yes'}, refusal: 'stale-assignment',
  },
  {
    id: 'oversized',
    meaning: 'A projection that cannot show its basis in the target refuses without truncating provenance.',
    text: document(decision('price'), '  Growth: Expansion [if price]').replace('title: Lantern', 'title: ' + 'H'.repeat(81)),
    answers: {price:'yes'}, refusal: 'unsafe-source-title',
  },
]);
