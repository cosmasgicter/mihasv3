# MIHAS Monorepo

Mukuba Institute of Health and Allied Sciences — platform monorepo.

## Structure

```
backend/              Django 5 + DRF API (Koyeb at api.mihas.edu.zm)
apps/admissions/      React admissions portal (Vercel at apply.mihas.edu.zm)
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

### From root (workspace)
```bash
bun install              # installs all app dependencies
bun run dev:admissions   # start admissions dev server
bun run build:admissions # production build
bun run test:admissions  # run tests
```

## Deployment

- Backend: Docker → Koyeb (`backend/Dockerfile`)
- Admissions: Vercel (`apps/admissions/vercel.json`)
- Each app deploys independently
