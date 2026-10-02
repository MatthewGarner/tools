# Five more things to think with

The second goal expands the same private bench from four to nine. Matthew's new preference is tactile interaction where it fits. The direct action must change the model or the thinking, with touch and keyboard/click alternatives.

| Route | Experiment | Working surface |
|---|---|---|
| teams | How teams fit the work | Capability cards inside editable team boundaries; compare the flow of work |
| delay | The delay between action and evidence | A directly controlled steering surface with delayed observations and replay |
| reliability | A system of almost reliable parts | An editable dependency graph with alternatives, common dependencies and injected failures |
| constraints | Constraint playground | Constraint cards moved into counterfactual experiments, then transferred back to a real test |
| analogy | Analogy workshop | Explicit mappings between a source mechanism and a target situation, including where they break |

Keep the original four working and their local data intact. Use fictional examples. Test the causal/state mechanisms and actual pointer/touch/keyboard journeys. The parent owns navigation, integration, browser verification and publication; independent agents implement their assigned routes.

## Delivered behaviour and findings

The gallery now has nine routes and a grouped experiment selector. All five additions save locally and export; the two new scaffolds also import editable JSON into new workspaces, preserving existing material. Mouse, real touch gestures and keyboard/click alternatives work. Shared card dragging scrolls at the viewport edge so stacked phone boards remain usable.

- **Teams:** moving Test into Build on the release workload reduced boundary handoffs from 51 to 31 and median lead time from 10.1 to 9.8 days, while finished work stayed at 20/30. Wider teams can help quiet flow and hurt busy flow under the exposed coordination assumptions. Moving one boundary can create another elsewhere in the route.
- **Delay:** after three manual steps, the actual level was 56.5 while the delayed instrument still showed 50. Steering, reveal, replay and rule comparison make that information gap inspectable. Both automatic rules face the same withdrawal pattern.
- **Reliability:** the default map had 96.00% availability. Holding one data feed down left 93.18%; holding the shared clock down left 0%. Redundancy protects against particular failures, not every common dependency. Geometry alone does not change probability; connections and pass rules do.
- **Constraints:** moving a constraint back to reality keeps its possibilities, adaptation and test. Each imaginary transformation retains separate notes. The distinction between an imagined condition and an actual limit is explicit.
- **Analogy:** role mapping affects relationship checks. Rematching invalidates affected judgments while retaining the earlier notes, making changed reasoning visible instead of silently carrying it forward.

## Verification

`npm test`: **78 passed, 0 failed** across all nine experiments, including the original 39 checks. Mechanism tests cover conservation, fair comparisons, exact reliability enumeration, shared dependencies, delay causality and bounded simulations. Scaffold tests cover graph integrity, remapping, workspace preservation, grouped Undo and export/import.

Actual browser journeys at 1440px and 390px covered pointer/touch changes in all five additions, keyboard alternatives, saved-state reload, Undo, model replay and exports. Both scaffold JSON round-trips preserved written tests. Reliability cycle rejection worked without damaging the map. Original routes opened through the new selector; commitment stepped, the battery day advanced, reframing saved text survived reload, and mixing/Undo worked. No page overflow was observed. Screenshots were inspected locally; generated QA content remains on the local-preview origin.

Browser testing caught and fixed a team replay slider that read its value after a pause redraw reset the element; the handler now captures input before rendering. Reliability node geometry now allows wrapped labels without losing the failure control, and phone selects wrap at usable widths. The phone gallery note uses a full text column.

**Try first:** Delay for the clearest immediate tactile experience; Teams for product/organisation discussion; Reliability for BESS dependency conversations. Bring a live question to Constraints or Analogy before deciding which scaffold deserves more features.

These are fictional mechanism models and thinking scaffolds, with explicit limits rather than empirical predictions. Reliability has no repair/time dynamics; team work has fixed skills and serial stages; the steering task has fixed repeatable disturbances. Scaffold mappings are user hypotheses. Browser saves are origin-specific; export durable copies.
