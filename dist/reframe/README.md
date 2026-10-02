# Reframing workbench

An editable thinking scaffold: start with a problem and questions, connect them to three to five alternative frames, compare the actions they imply, and carry selected writing into a working frame and small test. Questions can open or challenge frames through dragging or labelled selectors. Frames show their interpretation and next move first; editing and detailed prompts open progressively. Eight lenses supply questions, not generated answers. Forecasting and battery examples are fictional.

Each new problem, example, and import adds a saved session. Work autosaves under `thinking-lab:reframe:v1`; Undo restores up to 40 edit groups in the current tab. Source frames and the test draft remain independent. Markdown exports the whole note; JSON round-trips an editable session. Imports validate the format and receive new ids. Unreadable local data can be downloaded for recovery; a change in another tab pauses local saving to avoid overwriting it.

Limits: browser-local storage, no sync or AI, no prediction or scoring of a frame's quality. A session has three to five frames, fields allow 20,000 characters, imports allow 8 MB, and the workspace allows 100 sessions. Clearing browser data loses unexported work. A combined draft copies selected statements, next moves and assumptions; the first displayed chosen frame supplies the initial test. The user must reconcile and refine the draft.

Run `node --test dist/reframe/*.test.js` from the project root. Tests cover preservation between sessions, independent draft editing, portable exports, invalid imports, selection integrity, and safe handling of large combinations. Parent project handles browser verification. Two optional, feature-detected WebMCP tools read the workspace and edit existing fields through the same state transitions; browsers without WebMCP retain the complete UI.

## Consolidated Questions work

The Questions route remains usable as an earlier prototype. “Bring existing Questions work” reads its local v1 workspace and copies a chosen problem into a new Reframing session. Its source stays untouched. Original answers, evidence, ideas, types, status, selected questions, phase and parent branches remain; a source record identifies the earlier workspace. Questions JSON exports can also be imported directly. Reframing JSON preserves inquiry connections and source snapshots, remapping references into each imported session. Older Reframing sessions open with an empty inquiry.

New question branches are blank prompts with retained parents, not mechanically inverted sentences. Creating a frame copies a provisional answer and possible approach; later source edits do not overwrite it. Frame branches retain their immediate source snapshot. These sources appear in the interface and exports. Inquiry text is saved as it is edited, with the existing grouped Undo and cross-tab save protection.
