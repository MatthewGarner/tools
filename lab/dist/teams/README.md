# How teams fit the work

Gallery model 03; idea-bank ID M02.

Move six capability cards across three team boundaries using their drag handles or labelled **Move to** selectors. Team names are editable. Every move replays the same seeded workload from day 0, keeping the selected replay day. Pin a baseline, move capabilities, and compare the 30-day outcomes. Undo restores changes; reset restores the original layout while retaining workload, assumptions and baseline.

The canvas shows ready work at the selected day; ready counts include work being served. The bar shows progress on the first ready item. Select a work item to see its actual route, completed stages and transit position. Playback and the timeline scrub cached model states; the outcome metrics always describe the full 30 days. Lead-time statistics include completed jobs only, with unfinished counts shown alongside.

Each capability is one specialist with one nominal effort point per day. Per-capability capacity is `1 − coordination × (team size − 1)`. The illustrative coordination default is 5% per teammate. Crossing a boundary adds 0.75 days and 0.15 effort at the receiving capability. These create a real tradeoff: co-location removes transfers but can deepen a specialist bottleneck. In the seeded examples, one combined team shortens the quiet workload’s median lead time but finishes fewer jobs during the release rush.

Jobs follow fixed serial stages and FIFO queues in quarter-day slices. All specialists spend a slice before stage completions become available downstream, avoiding a processing-order artefact. Capacity is not shared across skills. Every elapsed slice is processing, transfer or queue time; original work, handoff effort and specialist capacity are accounted for separately. Models are fictional and uncalibrated: no learning, overlapping skills, parallel stages, rework, priorities or reorganisation costs.

Three fictional presets include product delivery and battery-storage commissioning. **Edit workload** exposes job count, arrival window, demand sample, work-type weights and serial capability stages with nominal effort. Drag stages or use Earlier/Later buttons; save validates the whole draft. Preset conversion preserves the exact original seeded jobs. Save up to six custom workloads; copies remain independent. Repeated visits to a capability are separate serial stages.

Four arrangement starters keep the same six specialists. Save up to six named arrangements alongside the current layout and pinned baseline. Saved designs freeze membership and names; active workload and shared coordination, boundary delay and receiving effort replay every design together. Requested effort versus full-period capacity ignores handoff effort and timing constraints; it is a bottleneck prompt, not a utilisation forecast.

Browser storage remains `thinking-lab:teams:v1`; old sessions and baselines load unchanged. Undo includes custom workloads and saved arrangements. Validated editable JSON imports replace the session atomically and can be undone; Markdown records active routes, assumptions, comparisons and job outcomes. No external dependencies or services.

Run `node --test dist/teams/*.test.js` from the project root. Tests exercise accounting, deterministic preset conversion, custom and repeated routes, grouping tradeoffs, independent saved designs, portable round trips and invalid imports. Desktop and phone integration covers pointer/touch/keyboard movement, dialog edge scrolling, comparison panning, focus, persistence and actual exports. Drag handles alone suppress touch scrolling; the editor opts into dialog-local scrolling and ghost placement.
