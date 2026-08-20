# Test integrity

Read this before adding or changing Node, browser, or meta-tests.

Test the observable contract, not the implementation of the test. First make a
small, valid mutation that causes the named assertion to fail for the reason you
predict; restore it and show the focused test passing. A syntax error or an unrelated
failure is not evidence.

Wait for the state required by the next assertion, not a weaker early signal. If the
state has no honest predicate, keep a documented, bounded settle rather than adding a
generic retry. A negative assertion must first be shown true after the action that is
supposed to change it. Use a known-positive check before treating a tool's silence as
absence.

Start with the focused test. Run `npm run test:node` for changed pure modules, and
run `npm run gate` before merge. Do not weaken assertions or retry a failure to make
a flake disappear; reproduce it serially and classify the cause.
