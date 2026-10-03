# Regular personal work — 3 October 2026

Implemented from main `0aa439b7` in `codex/suite-regular-work`.
Publication and authoritative verification are recorded on the pull request.

The catalogue's **Your work** reads native saves alongside explicit saved copies.
Filters distinguish live workspaces, drafts, copies and comparison baselines.
Links resume the selected workspace; Gauge question sets and Premortem registers
keep their native editing behaviour. Baselines open History against the current
draft. Discovery does not migrate stores or load tool engines. Energy remains on
its own storage origin. Favourites record only explicit preferences, and search
now recognises everyday intentions such as testing a hypothesis.

Alternatives compares individual hard constraints and preferences, with Unknown,
Meets, Partly meets and Does not meet judgements and supporting reasons. Changed
criteria or branches request reassessment without losing earlier writing.

Intervention keeps dated test attempts with frozen original expectations and
causal context, followed by observations, interpretation, decisions and next
checks. Source edits and removals cannot rewrite those original records.

Lab workbenches expose New, My work, Undo and Export consistently, with explicit
browser save status. Compact headers and a Guide disclosure bring the working
surface into view earlier. Tools label separate copies and comparison baselines
by their purpose. Existing routes, formats and old saves remain supported.

Focused state tests and real browser journeys cover resume, baseline selection,
favourites and storage failures, reassessment, test results and reload. Desktop
1440px and phone 390px renders in both themes were inspected; all SVG golden
outputs remain identical. The initial browser assertions were corrected to await
native dialog repaints and autosave completion rather than earlier DOM presence.
No new tools or cross-tool workflows are included.

3 October audit follow-up (implemented, awaiting release): Constraint playground
and Analogy workshop now consume catalogue workspace links through the shared
resume helper. Their bespoke shells previously ignored the pointer and opened the
last active workspace. The browser regression first failed with workspace two
where workspace one was requested; it now passes for both tools, including edit
isolation, reload after New, and missing-workspace recovery. Desktop 1440px and
phone 390px captures in both themes were inspected without overflow. The prior
Lab baseline passed all 276 Node tests; no model or stored-work format changed.
