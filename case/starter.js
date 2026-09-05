/* A warning-free authored frame. Empty references cannot imply evidence. */
export const STARTER = `title: Your decision
question: What choice are you making?
headline: State the choice and why it matters.
status: open
decision: No commitment authorised yet
unresolved: The choice remains open
font: chapter
view: brief

option first: First option
  value: What this option makes possible
  requires: What must be true
  downside: What you give up

option second: Second option
  value: What this option makes possible
  requires: What must be true
  downside: What you give up

claim premise: A premise to examine
  basis: assumption
  detail: State the premise explicitly.
  qualification: Describe what is still unknown.
  assumptions: Explain what would change your mind.`;
