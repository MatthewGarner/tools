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
# from repo root, in separate shells (both origins up for pwa/mobile):
node dev/serve.mjs 8087                 # tools origin
node dev/serve.mjs 8089 --origin=energy # energy origin

# then, from dev/pw — the whole chain (npm run verify IS the list; don't count here):
npm run verify
# or a single suite:
node smoke.mjs
BASE=<url> node smoke.mjs               # or against a preview deploy
```

`npm run verify` is the single source for "the full suite" — add a new suite there,
not to a prose list. Suites read `BASE`
(tools origin) and `EBASE`/`EPORT` (energy origin) env knobs; defaults are
:8087 / :8089.
