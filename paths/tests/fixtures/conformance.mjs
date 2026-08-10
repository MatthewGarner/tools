const pathsDecision = (name, fields = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-15${fields}`;

export const sharedCases = [
  {
    name:'resolved host', today:'2026-12-20', host:'groups',
    pathsDoc:`${pathsDecision('groups', '\n  answer: yes')}\nNOW\n  Core: Rider [if groups]\n  Core: Fallback [unless groups]`,
    roadmapDoc:'NOW\nCore: Host [bet: groups won]\nNEXT\nCore: Rider [if groups]\nCore: Fallback [unless groups]',
    itemIdentityMap:{Rider:{paths:7, roadmap:3}, Fallback:{paths:8, roadmap:4}},
    expect:{host:'true', items:{Rider:'in-plan', Fallback:'not-needed'}},
  },
  {
    name:'resolved-no host', today:'2026-12-20', host:'groups',
    pathsDoc:`${pathsDecision('groups', '\n  answer: no')}\nNOW\n  Core: Rider [if groups]\n  Core: Fallback [unless groups]`,
    roadmapDoc:'NOW\nCore: Host [bet: groups lost]\nNEXT\nCore: Rider [if groups]\nCore: Fallback [unless groups]',
    itemIdentityMap:{Rider:{paths:7, roadmap:3}, Fallback:{paths:8, roadmap:4}},
    expect:{host:'false', items:{Rider:'not-needed', Fallback:'in-plan'}},
  },
  {
    name:'unresolved host', today:'2026-12-10', host:'groups',
    pathsDoc:`${pathsDecision('groups')}\nNOW\n  Core: Rider [if groups]\n  Core: Fallback [unless groups]`,
    roadmapDoc:'NOW\nCore: Host [bet: groups]\nNEXT\nCore: Rider [if groups]\nCore: Fallback [unless groups]',
    itemIdentityMap:{Rider:{paths:6, roadmap:3}, Fallback:{paths:7, roadmap:4}},
    expect:{host:'unknown', items:{Rider:'waiting', Fallback:'waiting'}},
  },
  {
    name:'moot host', today:'2026-12-20', host:'pricing',
    pathsDoc:`${pathsDecision('groups', '\n  answer: no')}\n${pathsDecision('pricing', '\n  when: groups')}\nNOW\n  Core: Rider [if pricing]\n  Core: Fallback [unless pricing]`,
    roadmapDoc:'NOW\nCore: Groups [bet: groups lost]\nNEXT\nCore: Pricing [if groups] [bet: pricing]\nLater\nCore: Rider [if pricing]\nCore: Fallback [unless pricing]',
    itemIdentityMap:{Rider:{paths:13, roadmap:5}, Fallback:{paths:14, roadmap:6}},
    expect:{host:'false', items:{Rider:'not-needed', Fallback:'in-plan'}},
  },
  {
    name:'done outranks false', today:'2026-12-20', host:'groups',
    pathsDoc:`${pathsDecision('groups', '\n  answer: no')}\nNOW\n  Core: Finished [if groups] [done]`,
    roadmapDoc:'NOW\nCore: Host [bet: groups lost]\nNEXT\nCore: Finished [if groups] [done]',
    itemIdentityMap:{Finished:{paths:7, roadmap:3}},
    expect:{host:'false', items:{Finished:'in-plan'}},
  },
  {
    name:'duplicate titles pair by source identity', today:'2026-12-20', host:'groups',
    pathsDoc:`${pathsDecision('groups', '\n  answer: yes')}\nNOW\n  Core: Duplicate [if groups]\nLATER\n  Core: Duplicate [unless groups]`,
    roadmapDoc:'NOW\nCore: Host [bet: groups won]\nNEXT\nCore: Duplicate [if groups]\nLATER\nCore: Duplicate [unless groups]',
    itemIdentityMap:{first:{paths:7, roadmap:3}, second:{paths:9, roadmap:5}},
    expect:{host:'true', items:{first:'in-plan', second:'not-needed'}},
  },
];

export const knownDifference = {
  name:'moot child with written yes', today:'2026-12-20', host:'pricing',
  pathsDoc:`${pathsDecision('groups', '\n  answer: no')}\n${pathsDecision('pricing', '\n  when: groups\n  answer: yes')}\nNOW\n  Core: Marketplace [if pricing]`,
  roadmapDoc:'NOW\nCore: Groups [bet: groups lost]\nNEXT\nCore: Pricing [if groups] [bet: pricing won]\nLater\nCore: Marketplace [if pricing]',
  itemIdentityMap:{Marketplace:{paths:14, roadmap:5}},
  expect:{paths:{host:'false', items:{Marketplace:'not-needed'}}, roadmap:{host:'true', items:{Marketplace:'in-plan'}}},
};
