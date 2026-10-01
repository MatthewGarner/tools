# Where flexibility gets trapped

Open `index.html` through an HTTP server. Six hourly decisions let a player accept future energy deliveries / upward reserve and choose current battery dispatch. Firm promises narrow the feasible energy band. Finish a day to replay two policies against exactly the same progressively revealed schedule.

`engine.js` is pure. Battery: 4 MW, 8 MWh, 4 MWh initial stock, 90% efficiency each direction. One net action per hour. Contract energy replaces spot settlement; standby reserve pays once, retains its discharge energy and removes its MW from both import and export capacity. A backward energy floor prevents actions or new contracts that would make future promises impossible. Cash includes a £2 per imported/exported MWh throughput allowance. Net result adjusts final versus initial stock at £45 per stored MWh.

The policies receive only `publicView`: revealed prices, current offers, existing promises and past actions. Both charge at ≤£45/MWh and export at ≥£85/MWh, within feasibility. One accepts feasible offers in displayed order; the other declines them. Neither is optimal. Same-day manual replays are explicitly labelled informed. New day numbers use deterministic fictional schedules with varied outcomes.

Limits: no forecast or market calibration, reserve activation, grid constraints, ramping, self-discharge or detailed degradation. Reserve capacity is conservatively unavailable even while charging. The same-export-at-spot comparison changes settlement only; whole-run comparison is required for strategy opportunity cost. Terminal stock valuation is a common accounting convention, not a physical sale. The chart is physical feasibility, not a probability interval.

Run `node --test dist/flexibility/engine.test.js` from the project root. Tests cover energy/cash conservation over 240 varied runs, reserve deliverability, future feasibility, reachable-band extremes, progressive reveal, replay comparability and both policies winning on different days.

UI saves the active run and recent results locally and exports Markdown. `window.flexibilityExperiment` exposes visible state and validated actions without future prices. Two optional WebMCP tools read state and explicitly stage or commit an hour. Registration detects `document.modelContext`, then a navigator fallback; malformed input and registration failures are handled. Adapter contract tests use a stub registry; native browser WebMCP validation was unavailable. No external requests or libraries.
