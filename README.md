# MIHAS Monorepo

Mukuba Institute of Health and Allied Sciences — platform monorepo.

## Structure

```
backend/              Django 5 + DRF API (Koyeb at api.mihas.edu.zm)
apps/admissions/      React admissions portal (Vercel at apply.mihas.edu.zm)
apps/jobs-ops/        React operator dashboard for AI job operations
apps/website/         Future main website (placeholder)
apps/student-portal/  Future student management system (placeholder)
shared/               Shared types, utilities, design tokens
docs/                 Documentation
.kiro/                Kiro specs and steering files
```

## Quick Start

### Backend (Django API)
```bash
cd backend
pip install -r requirements.txt
python manage.py runserver  # or: docker-compose up
```

### Frontend (Admissions)
```bash
cd apps/admissions
bun install
bun run dev
```

### Frontend (Jobs Ops)
```bash
cd apps/jobs-ops
bun install
bun run dev
```

### From root (workspace)
```bash
bun install              # installs all app dependencies
bun run dev:admissions   # start admissions dev server
bun run dev:jobs-ops     # start jobs-ops scaffold
bun run build:admissions # production build
bun run build:jobs-ops   # production build
bun run test:admissions  # run tests
```

## Deployment

- Backend: Docker → Koyeb (`backend/Dockerfile`)
- Admissions: Vercel (`apps/admissions/vercel.json`)
- Each app deploys independently
