# Local preview

The machine's proxy can intercept localhost requests: use `curl --noproxy '*'` for readiness checks. The browser reaches the loopback server directly. The Playwright connector permits screenshots under its workspace output directory, not arbitrary `/tmp` paths.

The browser used for verification does not expose `document.modelContext`. WebMCP remains feature-detected; native registration validation is unavailable in that browser and is not required by the user.

Browser harness details: Reframing closes its export dialog on download. Commitment's export arrow is `aria-hidden`, so its accessible button name excludes the arrow; use the stable `#export` control in automation.

Reframing navigation includes visible step numbers in each accessible button name; browser journeys can use its stable `.view-nav [data-view]` selectors (the same actions also appear in page footers) instead of an exact text-only button name.

Creative-kit saves after a 220ms debounce and does not write the initial example on first render. Browser storage assertions must tolerate an absent key while waiting for the first edit/import to save; reading `.workspaces` from `JSON.parse(null)` fails in the harness before the app can finish saving.

Mixer migration fixtures must be seeded from a page without a mounted creative-kit workspace (for example About). Creative-kit flushes its in-memory session on `pagehide`, so navigating away from Territory after directly replacing its storage restores that page's prior state. A migration harness initially reported a lost partial placement for this reason; seeding on About preserved both the fixture bytes and partial classification.

Ancestry’s parked collection contains nested detail summaries. Browser journeys should target `.parked-collection > summary` when opening the collection; a descendant selector also selects each card’s reasoning details. Mixer’s shared collection toolbar must render in both generate and map views. Its dialog-to-concept path waits for the close event before focusing the editor, so the normal opener restoration cannot steal focus.

A synthetic touch fling can cross more than one generation before scroll snapping settles. Check that it lands on a generation boundary, rather than requiring the immediately next column. After route navigation, wait for `.lab-archive-notice` before reading its text; the body can be available before the shared shell finishes mounting.

For Analogy phone fixtures, wait for the mounted relationship editor before selecting an import file, then wait for the visible “Workshop imported” result. A fixed startup delay did not establish that the expected unmatched-role fixture was ready; inspecting the same export confirmed four target roles and no mappings.

Scenes integration uses the tool-owned browser page when temporary browser contexts close between calls; tool-call globals do not preserve handles. After creating a variation, wait for the dialog to close and the scene picker to receive focus before direct pointer geometry, since the shared close handler redraws the page. For Undo/import assertions, wait for the expected stored workspace count instead of assuming the 220ms save has fired after a fixed 250ms delay. The shared kit now keeps its pending/failed save message through redraws.

For Scenes screenshots, bringing the preview to the foreground and using CDP capture with `fromSurface: true` returned the rendered page; `fromSurface: false` returned a white frame. A white capture alone is not evidence of a blank application.

After using CDP mobile emulation, Exceptions QA found a 390px layout inside a larger capture despite the Playwright viewport setting. Set explicit desktop device metrics before pointer geometry; clearing a different CDP session’s override did not reset the effective layout. Check `innerWidth`, not only capture dimensions.
