# Local preview

The machine's proxy can intercept localhost requests: use `curl --noproxy '*'` for readiness checks. The browser reaches the loopback server directly. The Playwright connector permits screenshots under its workspace output directory, not arbitrary `/tmp` paths.

The browser used for verification does not expose `document.modelContext`. WebMCP remains feature-detected; native registration validation is unavailable in that browser and is not required by the user.

Browser harness details: Reframing closes its export dialog on download. Commitment's export arrow is `aria-hidden`, so its accessible button name excludes the arrow; use the stable `#export` control in automation.

Reframing navigation includes visible step numbers in each accessible button name; browser journeys can use its stable `.view-nav [data-view]` selectors (the same actions also appear in page footers) instead of an exact text-only button name.

Creative-kit saves after a 220ms debounce and does not write the initial example on first render. Browser storage assertions must tolerate an absent key while waiting for the first edit/import to save; reading `.workspaces` from `JSON.parse(null)` fails in the harness before the app can finish saving.

Mixer migration fixtures must be seeded from a page without a mounted creative-kit workspace (for example About). Creative-kit flushes its in-memory session on `pagehide`, so navigating away from Territory after directly replacing its storage restores that page's prior state. A migration harness initially reported a lost partial placement for this reason; seeding on About preserved both the fixture bytes and partial classification.
