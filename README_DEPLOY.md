### ProComp CI/CD and Deployment

This repo ships CI/CD to GitHub Actions for API (FastAPI) and Web (Next.js), plus E2E and perf testing.

### Environment
- Copy `.env.staging.example` and `.env.production.example` to your env provider.
- Note: `DATABASE_URL` is used by two runtimes:
  - Prisma (Node): `postgresql://...`
  - API (Python): `postgresql+asyncpg://...`
  Provide the appropriate value per process/job.

### Railway
- Create a Railway project and two services: `api` and `web`.
- Add `railway.json` at repo root (already included) to describe services.
- Set secrets in GitHub:
  - `RAILWAY_TOKEN` (Railway account token)
  - `RAILWAY_PROJECT_ID` (Project ID)
  - Optional: set `RAILWAY_DEPLOY_API` and `RAILWAY_DEPLOY_WEB` to `true` in GitHub repo Variables to enable deploys on main.

Link and deploy locally:
```
npm i -g @railway/cli
railway link --project <PROJECT_ID>
# Deploy API
(cd apps/api && railway up --service api)
# Deploy Web
(cd apps/web && railway up --service web)
```

### GitHub Actions
- `api-ci.yml`: pytest, Docker build+push to GHCR on main, deploy to Railway `api`.
- `web-ci.yml`: pnpm build, deploy to Railway `web` on main.
- `e2e.yml`: spins Postgres+Redis, runs API+Web locally, executes Playwright.
- `perf.yml`: starts ephemeral stack via compose, runs k6 WS and HTTP smoke tests.

### Local perf/e2e
- Perf: `docker compose -f docker-compose.staging.yml up -d postgres redis api` then `k6 run perf/ws/ws_match_broadcast.js`.
- E2E: `pnpm db:push && pnpm seed:staging`, start API and Web locally, then `pnpm e2e`.