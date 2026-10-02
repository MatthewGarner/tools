# Constraint playground

Move a constraint into Remove, Reverse or Exaggerate; each keeps separate notes. Restore the real limit, then develop several practical adaptations. Original notes remain editable and are never replaced by an adaptation. Each new alternative freezes the problem, constraint, basis and counterfactual that prompted it.

Adaptations distinguish the useful principle kept from the imaginary assumption left behind. Their fit boards carry every current constraint into Unresolved, Works within the limit, or Needs a change or permission, with written reasoning. Move judgements by pointer/touch or labelled selectors. Phone dragging scrolls sideways at the board edge. These are user judgements, not verified feasibility or authorisation.

Changed constraint wording or basis requests review; accepting the current wording returns its judgement to Unresolved while retaining the original source and prior explanation. Newly added constraints are shown as unchecked until included. Removing a board card preserves its earlier checks. Branching freezes the parent's mechanism and fit reasoning, with a reason for the variation. Parents with descendants can be parked; comparison shows up to four alternatives and records a chosen test without discarding the others.

Local saving remains `thinking-lab:constraints:v1`. Legacy notes open unchanged with an empty adaptation collection. Up to 40 grouped changes can be undone in the current tab. Imports add a workspace, remap live references, and validate before changing work. Markdown and editable JSON retain alternatives, fit judgements, original/current source wording, ancestry, decisions and tests. Another tab pauses saving; malformed saved data can be downloaded before replacement.

Limits: 12 current constraints, 24 adaptations, 18 current/earlier checks per adaptation, 100 workspaces, 20,000 characters per field and 16 MB JSON imports. Flat source snapshots and an export-size guard prevent unimportable branches. Examples are fictional; no external verification or services.

Run `node --test dist/constraints/*.test.js` from the root. Tests cover legacy notes, independent adaptations, changed limits, branch snapshots, maximum-length writing, portable remapping, invalid imports and Undo. Desktop and phone journeys cover dragging, edge scrolling, keyboard focus, comparison panning, persistence and actual downloads.
