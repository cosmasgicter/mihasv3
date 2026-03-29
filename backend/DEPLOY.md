# Koyeb Deployment Guide - MIHAS Django API

## Required topology

- Backend API: `api.mihas.edu.zm` on Koyeb
- Frontend app: `apply.mihas.edu.zm` on Vercel

Do not use the default `*.vercel.app` domain for authenticated production traffic. The backend is configured for shared cookies on `.mihas.edu.zm` with `SameSite=Lax`, so the frontend and API must stay on sibling `mihas.edu.zm` subdomains for login, refresh, CSRF, and session flows to work correctly.

## Koyeb web service

Create a Koyeb `WEB` service from this GitHub monorepo with these settings:

- Source: GitHub repository
- Branch: your production branch
- Builder: Dockerfile
- Work directory: `backend`
- Dockerfile location: `Dockerfile`
- Command override: leave empty and use the image default command
- Exposed port: `8000`
- Route: `/`
- Health check protocol: HTTP
- Health check path: `/health/ready/`
- Instance count: start with `1`
- `PORT`: `8000`
- `WEB_CONCURRENCY`: `1`

The image default command is defined in [Dockerfile](/home/cosmas/Downloads/mihasv3/backend/Dockerfile) and starts Uvicorn in ASGI mode.

## Koyeb worker service

Create a second Koyeb `WORKER` service from the same repo:

- Source: same GitHub repository and branch
- Builder: Dockerfile
- Work directory: `backend`
- Dockerfile location: `Dockerfile`
- Command override: `celery -A config worker -l info`
- No exposed port
- Instance count: start with `1`

## Backend environment variables

Set these in both Koyeb services unless noted otherwise. The same list is captured in [backend/.env.example](/home/cosmas/Downloads/mihasv3/backend/.env.example).

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `DJANGO_SETTINGS_MODULE` | yes | `config.settings.prod` |
| `SECRET_KEY` | yes | Long random string |
| `DATABASE_URL` | yes | Neon pooled Postgres URL with SSL |
| `REDIS_URL` | yes | `rediss://...` for Upstash or hosted Redis |
| `CELERY_BROKER_URL` | recommended | Usually same value as `REDIS_URL` |
| `JWT_SIGNING_KEY` | yes | Separate long random signing key |
| `ALLOWED_HOSTS` | yes | `.beanola.com,.mihas.edu.zm,.katc.edu.zm` |
| `CORS_ALLOWED_ORIGINS` | yes | `https://apply.mihas.edu.zm` |
| `CORS_ALLOWED_ORIGIN_REGEXES` | recommended | `^https://([A-Za-z0-9-]+\.)*beanola\.com$,^https://([A-Za-z0-9-]+\.)*mihas\.edu\.zm$,^https://([A-Za-z0-9-]+\.)*katc\.edu\.zm$` |
| `RESEND_API_KEY` | yes | Resend production API key |
| `EMAIL_FROM` | recommended | `admissions@mihas.edu.zm` |
| `S3_ENDPOINT_URL` | yes | Cloudflare R2 S3 endpoint |
| `S3_BUCKET` | yes | R2 bucket name |
| `S3_ACCESS_KEY` | yes | R2 access key |
| `S3_SECRET_KEY` | yes | R2 secret key |
| `PORT` | optional | `8000` |
| `WEB_CONCURRENCY` | optional | `1` to start |
| `READ_ONLY_MODE` | optional | `false` |

`CSRF_TRUSTED_ORIGINS` is not used by the current settings module, so do not add it unless the backend is changed to read it.

## First deploy checklist

1. Provision Neon Postgres and copy the pooled `DATABASE_URL`.
2. Provision Redis and copy the TLS `REDIS_URL`.
3. Provision Cloudflare R2 and copy the S3-compatible endpoint and credentials.
4. Create a Resend API key.
5. Create the Koyeb web service with the settings above.
6. Create the Koyeb worker service with the same env vars.
7. Run `python manage.py migrate` once against the production database before scaling above one replica.
8. Add the Koyeb custom domain `api.mihas.edu.zm`.
9. Point DNS for `api.mihas.edu.zm` to the Koyeb target shown in the dashboard.

## Vercel frontend checklist

Create a separate Vercel project from the same monorepo:

- Git repository: this repo
- Root directory: `apps/admissions`
- Framework preset: Other / Vite auto-detection is fine
- Install command: `bun install`
- Build command: `bunx --bun vite build`
- Output directory: `dist`
- Production domain: `apply.mihas.edu.zm`

These build settings are already encoded in [vercel.json](/home/cosmas/Downloads/mihasv3/apps/admissions/vercel.json).

## Frontend environment variables

Set these in the Vercel project. The example file lives at [apps/admissions/.env.example](/home/cosmas/Downloads/mihasv3/apps/admissions/.env.example).

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | recommended | `https://api.mihas.edu.zm` |
| `VITE_APP_BASE_URL` | recommended | `https://apply.mihas.edu.zm` |
| `VITE_SITE_URL` | recommended | `https://apply.mihas.edu.zm` |
| `VITE_APP_VERSION` | recommended | release tag or commit SHA |
| `VITE_VAPID_PUBLIC_KEY` | optional | Required only for push notifications |
| `VITE_ENABLE_AUTO_RELOAD` | optional | `false` in production |
| `VITE_ENABLE_LOADER_TELEMETRY` | optional | `false` in production |

Note: `VITE_API_BASE_URL` should be the API origin. The frontend client already appends `/api/v1`.

## DNS

- Point `api.mihas.edu.zm` to Koyeb.
- Point `apply.mihas.edu.zm` to Vercel.
- Keep both on `mihas.edu.zm` subdomains to preserve same-site cookie auth.
