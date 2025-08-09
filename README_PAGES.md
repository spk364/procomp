## GitHub Pages Demo

This repository supports deploying a static demo of the Next.js web app to GitHub Pages using mocked API and WebSocket behavior.

- Environment flag: `NEXT_PUBLIC_DEMO_PAGES=1`
- Static export: Next.js `output: "export"`
- Assets served under a basePath derived from the repository name

### Enable Pages
1. In GitHub Settings → Pages, set Source to "GitHub Actions".
2. The workflow `.github/workflows/pages.yml` deploys on pushes to `main` or via "Run workflow".
3. The demo will be available at: `https://<owner>.github.io/<repo>/`.

### Local demo
```
cd apps/web
NEXT_PUBLIC_DEMO_PAGES=1 NEXT_PUBLIC_BASE_PATH=<repo> pnpm build && pnpm export && npx serve out
```

### Notes
- Demo uses mocked data only. No FastAPI, WebSocket server, or real payments are used.
- Dynamic routes (`/referee/[matchId]`, `/hud/[matchId]`) are pre-generated for a small sample of match IDs.
- Production/server runtime remains unchanged when `NEXT_PUBLIC_DEMO_PAGES` is not set to `1`.