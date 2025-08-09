# ProComp - BJJ Tournament Management Platform

A modern, scalable alternative to SmoothComp for managing Brazilian Jiu-Jitsu tournaments.

## 🏗 Architecture

This is a **Turborepo monorepo** with the following structure:

```
procomp/
├── apps/
│   ├── web/          # Next.js 14 (App Router) - Frontend
│   └── api/          # FastAPI - Backend API
├── packages/
│   ├── db/           # Database schema & migrations
│   ├── ui/           # Shared React components (ShadCN)
│   └── utils/        # Shared utilities & types
└── ...config files
```

## 🚀 Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- ShadCN UI
- Supabase Auth

**Backend:**
- FastAPI (Python)
- PostgreSQL
- Async/await architecture
- Pydantic models

**Payments:**
- Kaspi QR (manual integration)
- Stripe Wallet (Apple Pay, Google Pay)

**Deployment:**
- Frontend: Vercel
- Backend: Railway
- CI/CD: GitHub Actions

## 🛠 Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Python 3.11+
- PostgreSQL 15+

### Installation

```bash
# Install dependencies
pnpm install

# Setup environment files
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Start development servers
pnpm dev
```

This will start:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Database Setup

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Push schema changes
pnpm db:push
```

## 📁 Package Structure

- **`apps/web`** - Next.js frontend application
- **`apps/api`** - FastAPI backend service
- **`packages/db`** - Database layer (Prisma, migrations)
- **`packages/ui`** - Shared UI components (atomic design)
- **`packages/utils`** - Shared utilities, types, validators

## 🔧 Development Commands

```bash
pnpm dev          # Start all dev servers
pnpm build        # Build all apps
pnpm lint         # Lint all packages
pnpm type-check   # TypeScript check
pnpm test         # Run tests
pnpm clean        # Clean build artifacts
```

## 🎯 Core Features

- Tournament creation & management
- Competitor registration & brackets
- Real-time scoring & results
- Payment processing (Kaspi QR, Stripe)
- Multi-language support
- Mobile-responsive design
- Admin dashboard
- Reporting & analytics

## 📄 License

MIT License - see [LICENSE](LICENSE) for details. 

## Security & Environments

Create GitHub Environments: `staging`, `production`.

Required secrets for both environments:

- DATABASE_URL
- REDIS_URL
- SUPABASE_URL
- SUPABASE_ANON_KEY
- STRIPE_SECRET_KEY
- KASPI_API_KEY
- VERCEL_TOKEN
- VERCEL_ORG_ID
- VERCEL_PROJECT_ID
- RAILWAY_TOKEN

Protect `production` with required reviewers. Ensure branch protection on `main` requires green checks (web-ci, api-ci, db-migrate, e2e) before deployment. 