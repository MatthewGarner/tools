# Local preview

The machine's proxy can intercept localhost requests: use `curl --noproxy '*'` for readiness checks. The browser reaches the loopback server directly. The Playwright connector permits screenshots under its workspace output directory, not arbitrary `/tmp` paths.

The browser used for verification does not expose `document.modelContext`. WebMCP remains feature-detected; native registration validation is unavailable in that browser and is not required by the user.

Browser harness details: Reframing closes its export dialog on download. Commitment's export arrow is `aria-hidden`, so its accessible button name excludes the arrow; use the stable `#export` control in automation.

Reframing navigation includes visible step numbers in each accessible button name; browser journeys can use its stable `.view-nav [data-view]` selectors (the same actions also appear in page footers) instead of an exact text-only button name.
