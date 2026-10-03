# Browser test harness

Not deployed — dev only (kept out of repo root so Vercel treats the site as static).

```bash
cd dev/pw && npm install && npx playwright install chromium webkit
```

`webkit` is required by `webkit.mjs` — the real-Safari-engine smoke. The other
suites emulate iPhone/Pixel metrics on Blink, which renders differently from
Safari; `webkit.mjs` catches the "unstyled/overflowing on iOS Safari" bug class
those miss.

**Serve with `dev/serve.mjs`, not `python3 -m http.server`** — serve.mjs applies
vercel.json's production headers (CSP included), so the suites prove CSP
compatibility; a plain static server no longer exercises what production ships.

```bash
# From the repository root; each invocation owns its servers and evidence:
npm run test:changed -- --plan
npm run test:changed
npm run test:browser -- --tool rank
npm run test:browser -- --tool map --suites smoke.mjs --jobs 1
npm run gate
```

Use a comma-separated tool list for a focused integration investigation. The runner
prints its selection, owned origins, per-suite timings and retained log directory.
Unknown tool/suite names fail. Full gates clear inherited debug filters; focused
checks never claim complete coverage. `--ports A B` is available when fixed local
ports are explicitly needed; a bind conflict fails instead of reusing a server.

`npm run verify` remains the canonical complete browser-suite list. Direct scripts
accept `BASE` and `EBASE` for intentional testing against existing origins; prefer
the root runner for local work so concurrent worktrees cannot share server state.
