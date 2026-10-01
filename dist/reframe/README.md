# Reframing workbench

An editable thinking scaffold: start with a problem, develop three to five frames, compare the actions they imply, and carry selected writing into a working frame and small test. Eight lenses supply questions, not generated answers. Forecasting and battery examples are fictional.

Each new problem, example, and import adds a saved session. Work autosaves under `thinking-lab:reframe:v1`; Undo restores up to 40 edit groups in the current tab. Source frames and the test draft remain independent. Markdown exports the whole note; JSON round-trips an editable session. Imports validate the format and receive new ids. Unreadable local data can be downloaded for recovery; a change in another tab pauses local saving to avoid overwriting it.

Limits: browser-local storage, no sync or AI, no prediction or scoring of a frame's quality. A session has three to five frames, fields allow 20,000 characters, imports allow 5 MB, and the workspace allows 100 sessions. Clearing browser data loses unexported work. A combined draft copies selected statements, next moves and assumptions; the first displayed chosen frame supplies the initial test. The user must reconcile and refine the draft.

Run `node --test dist/reframe/*.test.js` from the project root. Tests cover preservation between sessions, independent draft editing, portable exports, invalid imports, selection integrity, and safe handling of large combinations. Parent project handles browser verification. Two optional, feature-detected WebMCP tools read the workspace and edit existing fields through the same state transitions; browsers without WebMCP retain the complete UI.
