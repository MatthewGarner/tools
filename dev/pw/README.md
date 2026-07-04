# Browser test harness

Not deployed — dev only (kept out of repo root so Vercel treats the site as static).

```bash
cd dev/pw && npm install && npx playwright install chromium
# serve the repo:  python3 -m http.server 8087  (from repo root)
node check.mjs            # roadmap parity checks against http://localhost:8087
BASE=<url> node check.mjs # or against a preview deploy
```
