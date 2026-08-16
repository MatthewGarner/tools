const decision = (name, fields = '') => `decision ${name}:
  question: Should we continue ${name}?
  signal: measurable ${name} result
  reading: current ${name} reading
  owner: ${name} owner
  answer-by: 2026-09-30${fields}`;

const periods = (item) => ['NOW', 'NEXT', 'LATER'].map((period, periodIndex) => {
  const rows = Array.from({length:8}, (_, index) => item(periodIndex, index));
  return `${period}\n${rows.join('\n')}`;
}).join('\n');

const realisticDecisions = [
  decision('pricing', '\n  assume: yes 2026-08-10'),
  decision('groups'),
  decision('retention', '\n  answer: yes 2026-08-09'),
  decision('expansion', '\n  when: pricing and groups'),
  decision('coach-supply'),
  decision('positioning', '\n  when: retention'),
].join('\n');

const realisticText = `title: Lantern choices
date: 2026-08-11
verdict: Keep the shared plan moving while the open questions resolve
${realisticDecisions}
${periods((period, index) => {
  const lane = index % 3 === 0 ? 'Core' : index % 3 === 1 ? 'Growth' : 'Learning';
  const conditions = [
    '', ' [if pricing]', ' [unless pricing]', ' [if groups and retention]',
    ' [if pricing or coach-supply]', ' [if expansion]', ' [if positioning]', ' [if retention]',
  ];
  const status = period === 0 && index === 0 ? ' [doing]' : period === 2 && index === 7 ? ' [risk]' : '';
  return `  ${lane}: Work ${period + 1}.${index + 1}${conditions[index]}${status}`;
})}`;

const hostileToken = '<script>alert("paths")</script>&' + 'unbroken'.repeat(24);
const hostileDecisions = [
  decision('alpha', '\n  assume: no 2026-08-10'),
  decision('beta'),
  decision('gamma', '\n  answer: yes 2026-08-09 -- observed <strong>signal</strong>'),
  decision('delta', '\n  when: alpha or beta'),
  decision('epsilon', '\n  when: gamma'),
  decision('zeta'),
].join('\n');

const hostileText = `title: ${hostileToken}
date: 2026-08-11
verdict: Preserve every & conditional route "without" inventing certainty
${hostileDecisions}
${periods((period, index) => {
  const conditions = [
    ' [if alpha]', ' [unless alpha]', ' [if beta and gamma]', ' [if delta or epsilon]',
    ' [if missing]', ' [if alpha and]', ' [if zeta]', '',
  ];
  const title = index === 7 ? hostileToken : `Adversarial ${period + 1}.${index + 1}`;
  return `  Lane-${index % 4}: ${title}${conditions[index]}`;
})}`;

export const PATHS_INTERACTION_CASES = Object.freeze([
  {
    id:'realistic',
    text:realisticText,
    editedText:realisticText.replace('assume: yes 2026-08-10', 'answer: no 2026-08-13'),
  },
  {
    id:'hostile',
    text:hostileText,
    editedText:hostileText.replace('current beta reading', 'revised beta reading & <new>'),
  },
]);
