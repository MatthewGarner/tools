# Steering through delay

Drag a real inflow lever while steering from an old level reading. Arrow keys and labelled plus/minus buttons do the same job. Step, run/pause, undo a tick and reveal actual state. The separate comparison mode replays feedback rules against one disturbance sequence; pin a rule and vary reporting lag, actuator response, strength and review interval. Scrub time to inspect what the rule saw and did.

The reservoir conserves stock through inflow, withdrawal, overflow and unmet withdrawal. Observation delay and actuator response are distinct. The automatic proportional rule only sees historical level and a nominal withdrawal of 5. All scenarios/coefficients are fictional; no noise, calibration or integral controller. Manual replays repeat a fixed training pattern and are not blind skill comparisons. Setup edits apply only on New run; rule edits replay from tick 0.

Work saves locally; Markdown export includes all actual state, even when hidden during steering. Browser storage is not cross-device sync. Run `node --test dist/delay/engine.test.js` from the project root.
