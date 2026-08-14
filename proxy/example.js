/* House examples for the Proxy Hunt shell. Kept outside app.js so the default
   source can be exercised by Node without importing DOM-bound code. */

export const INVITATION_HUNT = `title: Group invitations
date: 2026-08-13
outcome: Groups retain after the first week
proxy: Invitation rate
action: Prompt every active member to invite friends
mode: optimise

intended-theory:
  mechanism: Relevant friends join established groups

protects:
  - Qualified groups retained after seven days

failure-theory low-intent:
  mechanism: Prompts create low-intent invitations and noisier groups
  harmed-outcome: Qualified groups retained after seven days
  guardrail: Qualified group retention after seven days
  basis: reasoned-mechanism
  support: High-invite cohorts have lower qualified retention
  weaken-with: Qualified retention remains comparable in matched prompted and unprompted cohorts

failure-theory support-load:
  mechanism: More invitations create groups that need more moderation support
  harmed-outcome: Groups retain after the first week
  guardrail: Support requests per newly active group
  basis: speculative-concern
  weaken-with: Support demand remains flat as invitation rate increases

reported-pattern:
  proxy-reading: +18%
  outcome-reading: -11%
  outcome: Qualified groups retained after seven days
  population: Invited teams
  horizon: Prior 14 days
  comparator: Previous 14 days
  source: Author-entered product reading`;

export const MONITOR_HUNT = `title: Activation quality
date: 2026-08-13
outcome: New teams reach their first shared success
proxy: Setup completion rate
action: Shorten guided setup and defer advanced choices
mode: monitor
optimisation-pressure: Quarterly activation target

intended-theory:
  mechanism: A shorter setup gets teams to useful shared work sooner

protects:
  - Teams configured for their real workflow

failure-theory shallow-setup:
  mechanism: Deferring choices produces generic setups that teams abandon
  harmed-outcome: Teams configured for their real workflow
  guardrail: Useful configurations still active after four weeks
  basis: reasoned-mechanism
  support: Setup interviews show teams rely on early configuration choices
  weaken-with: Assigned shorter-setup teams retain equally useful configurations after four weeks`;

export const TRADE_OFF_HUNT = `title: Notification trade-off
date: 2026-08-13
outcome: People return to their active habits
proxy: Reminder open rate
action: Increase reminder frequency for inactive habits
mode: optimise

intended-theory:
  mechanism: More timely reminders help people resume a lapsed habit

protects:
  - Notification trust
  - Week-four retention

failure-theory fatigue:
  mechanism: More reminders make the product feel intrusive
  harmed-outcome: Notification trust
  guardrail: Notification opt-out rate
  basis: reasoned-mechanism
  weaken-with: Opt-out and complaint rates stay flat in an assigned frequency test

trade-off: Reminder response versus notification trust
decision-rule:`;

export const EXAMPLES = [
  {name: 'Two theories', src: INVITATION_HUNT},
  {name: 'Monitor a measure', src: MONITOR_HUNT},
  {name: 'Trade-off pending', src: TRADE_OFF_HUNT},
];
