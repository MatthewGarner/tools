# A system of almost reliable parts

Model 05 on the bench; idea-bank M11.

Open `index.html` through the project’s HTTP server. The BESS example starts with two feeds sharing a clock, then a data gate, decision service, command channel and battery response. The second example is an online checkout.

Drag node names to arrange the map. Select a right output port and then a left input port to add a dependency; click a wire to remove it. The selected node’s dependency list and selector provide the same edits without pointer precision. Node names are keyboard buttons; arrows move them, Shift moves farther. Inject failures directly on components. Backups create an ANY gate and inherit upstream dependencies. Adding a shared requirement asks for two component names.

`engine.js` enumerates all independent component states, evaluates the DAG once per state and sums successful-state probability. Reused nodes therefore count once. Components need their own availability AND all dependencies; gates use ALL/ANY and fail when empty. A forced outage conditions the result on that node being down. Path colours assume every non-failed component is up. “Make one perfect” rankings hold the map and other probabilities fixed and exclude injected outages.

Bounds: 12 total nodes, 10 uncertain components. Values are fictional success probabilities for one explicitly defined service request, not annual uptime. No empirical calibration, temporal failure/repair model, switching failures, capacity limits or hidden correlations. Shared nodes capture explicit common causes only. A backup has an independent own state but shares copied upstream requirements. Ranking is not cost-adjusted.

Undo/redo covers graph, layout, probabilities, failures, scenarios and pinned baseline during the session. Current state, baseline and comparison notebook persist locally; export includes readable decisions and results plus the complete maps and notebook JSON. Mobile uses a horizontally pannable canvas with full-sized nodes. Parent owns actual browser/pointer validation.

Run `node --test dist/reliability/engine.test.js`. Eight tests cover shared dependencies, independent alternatives, conditioned outages, common failure, cycles, bounds, empty gates and marginal-improvement ranking. No external runtime dependencies.

Optional WebMCP tools read the visible model and apply dependency/failure edits through the same app actions. Input is checked before mutation; registry failures are caught. `webmcp.test.js` checks this adapter against a stub registry; native browser support is not assumed or claimed as validated.

## Design comparison

The notebook retains up to eight named, independent map snapshots with editable effort estimates, success definitions, assumptions and evidence. The working decision remains alongside the alternatives. Changing a saved design requires loading it and saving a new snapshot. Gains are relative to the current pinned baseline and are withheld when success definitions differ. Effort units are stored with each design and never silently converted. Older v1 maps open with an empty notebook.

Four editable BESS starting points compare a better command channel, a backup, separate clocks, and a local fallback with its own measurement dependency. They start from the pinned baseline, retain Undo, and disclose the assumptions required to deliver the same service. The inspector names upstream requirements inherited by a backup and shows the output probability when the selected component is held down. No repair, switching or battery time dynamics were added.

`study.test.js` covers snapshot preservation, comparison definitions, independent versus shared failure paths, fallback dependencies, unused components and validation limits.
