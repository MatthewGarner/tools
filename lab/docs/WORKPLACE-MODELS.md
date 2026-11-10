# Workplace models

Approved 3 October 2026: six new playable models and two extensions to Teams, based on the designs in this chat. Start at main `9520721b`. Shipping includes article views, saved comparisons, portable state, accessible tactile controls and current release checks.

| Route | Reading and interaction | Mechanism boundary | Status |
| --- | --- | --- | --- |
| authority | Move information, authority and consultation between roles; trace decisions | Explicit information requirements, approval queues and coupled choices; no personality scores | Implemented |
| context | Carry facts through reporting layers; inspect what changed a decision | Finite attention, deterministic selection and source retrieval; no simulated language understanding | Implemented |
| consistency | Assign standards to interfaces and internal practices | Explicit local requirements and cross-team compatibility, with separately exposed costs | Implemented |
| alignment | Disturb an agreed plan; reveal divergent responses | Explicit decision rules and beliefs; agreement is not scored as inherently good | Implemented |
| possibilities | Sequence enabling work and delivery; watch reachable opportunities change | Prerequisites, budget and changing demand; enabling work need not pay off | Implemented |
| clocks | Move discovery, delivery, funding and review times | Event timing and windows determine when evidence can affect work; review has an exposed cost | Implemented |
| teams | Add informal coordination and customer/technical/funding/team views | Preserve the existing workload engine; expose additional assumptions and keep prior saves readable | Implemented |

Each new model uses a distinct working surface and a pure engine. Comparisons replay the same external situation. Facts revealed after a decision remain distinguishable from facts available at the time. Fictional examples must include a counterexample to the default lesson. No empirical organisation scores, live AI, or employer material.

Native journeys cover accessible drag/select alternatives, saved comparisons, Undo/Redo, reload, JSON import/export, SVG/PNG export, transient article links and concurrent edit protection. Desktop and phone renders were inspected in both themes against Accuracy. Article views have current-state native handoffs. Existing Teams saves gain default maps; published v1 article links migrate to v2 without overwriting personal work.

Shared regression coverage lives in `dev/pw/workplace-models.mjs`, with standalone packaging covered by `lab-article-origin.mjs`. Release checks: 3,515 Node tests, golden verification and all 30 browser suites passed. The Teams suite was rerun serially after containing offscreen table labels and correcting its asynchronous article-link wait. Seven immutable article versions were added; all 54 published versions pass the catalogue check. PR CI and production confirmation are recorded in the delivery task.
