# Four experiments to try

| Experiment | A useful first move | My assessment |
|---|---|---|
| Commitment spiral | Fork at week 6. Try 70% promises, 85% quality and 15% recovery in week 7, then replay it in week 20. Weaken the feedback assumptions afterwards. | Strongest exploratory model. Timing and assumptions can change the apparent lesson. |
| Where flexibility gets trapped | Accept the first delivery offer and inspect the lost energy range. Finish the day, then run both policies. | Strongest BESS experiment. The next iteration should centre on a specific decision or commitment type. |
| Reframing workbench | Replace the example with a current problem. Compare the interventions implied by three frames before choosing a test. | Most immediately useful at work. Its next test is whether it changes an actual next move. |
| Possibility mixer | Lock one ingredient, mix the rest, then explain one combination in concrete terms. Edit the dimensions if the combinations become repetitive. | Best for a short curiosity session. The quality of the dimensions matters more than more generation. |

## What the prototypes already revealed

In the commitment model, the early intervention produces 56.4 more usable points than its baseline under the illustrative defaults. With repair cost reduced to 0.5 and fatigue-capacity / direct lateness-reporting effects set to zero, the same intervention produces 88.8 fewer. That reversal is a useful invitation to question the mechanism, not an empirical management finding.

On fictional battery day 14, the browser playthrough ended at £696 adjusted value; the firm-revenue rule ended at £593 and the wait-for-spot rule at £690. Other seeded days reverse the policy ranking. This is a comparison of defined policies under one accounting convention, not an optimal strategy or financial forecast.

## Verification

`npm test`: **39 passed, 0 failed**. Covers work/defect/effort conservation, intervention timing, shared-assumption replay, energy and cash conservation over 240 varied runs, commitment feasibility, fair information sets, import/export preservation and guarded tool actions.

Actual browser journeys at **1440 × 900/1000** and **390 × 844** checked:

- Commitment: fork, schedule, step, run/pause, replay assumptions, restore defaults, remove a scheduled policy, keyboard focus, chart views, reload and Markdown export.
- Battery: select commitments, dispatch, reveal all six hours, reload mid-run, complete both policy replays, informed manual replay and comparison export. Invalid dispatch leaves state unchanged. The live envelope now sits beside the decision; the desktop advance button fits within 900px.
- Reframing: edit, select frames, compare, copy into an independent draft, reload, export/import JSON and retain earlier sessions. Mobile comparison and editing have no page overflow.
- Mixer: lock, mix, capture, edit dimensions without rewriting captured ingredients, reload, Markdown export, reject invalid imports, keyboard focus, unreadable-data recovery and cross-tab save protection.

Screenshots were visually inspected. No horizontal page overflow was found at the checked sizes. The four apps are local static HTML/CSS/JavaScript; no runtime dependency or external data is needed.

Native WebMCP validation was unavailable: the test browser exposes no model-context API. Optional adapters are feature-detected; relevant adapters have unit coverage. The normal UI is fully independent of them.

## Limits and next iteration

The team model uses invented coefficients and homogeneous work. The battery model has six one-hour periods, simple reserve rules, fixed efficiency and a common terminal stock value; it omits actual market and operational complexity. The scaffolds guide writing rather than generate or score answers. Local saves belong to one browser/origin; Markdown and JSON exports are the durable handoff.

I would use **Reframing** on a live work question first, then spend the next modelling iteration on **Flexibility**. Keep **Commitment** as the strongest general-purpose systems sketch. Choose the next investment from what you find yourself wanting to change while playing, rather than feature count.
