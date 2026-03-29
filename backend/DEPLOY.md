# Koyeb Deployment Guide — MIHAS Django API

## Domain
- API: `api.mihas.edu.zm` → Koyeb web service
- Frontend: `apply.mihas.edu.zm` → Vercel (separate project)

## Services on Koyeb

### 1. Web Service (Django + gunicorn)
- **Docker image**: Build from `django_api/Dockerfile`
- **Start command**: `gunicorn config.wsgi:application --config gunicorn.conf.py`
- **Port**: 8000
- **Health check**: `/health/live/` (liveness), `/health/ready/` (readiness)
- **Custom domain**: `api.mihas.edu.zm` with managed TLS
- **Scaling**: Start with 1 replica, autoscale on CPU/memory

### 2. Celery Worker
- **Same Docker image** as web service
- **Start command**: `celery -A config worker -l info`
- **No port exposed** (background worker only)
- **Scaling**: 1 replica, scale based on queue depth

## Environment Variables (set in Koyeb dashboard)

Copy from `django_api/.env.production`:

| Variable | Value |
|----------|-------|
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` |
| `SECRET_KEY` | (from .env.production) |
| `DEBUG` | `false` |
| `ALLOWED_HOSTS` | `api.mihas.edu.zm` |
| `DATABASE_URL` | (Neon pooled connection string) |
| `REDIS_URL` | `rediss://default:AYrR...@supreme-elf-35537.upstash.io:6379` |
| `CELERY_BROKER_URL` | (same as REDIS_URL) |
| `JWT_SIGNING_KEY` | (from .env.production) |
| `CORS_ALLOWED_ORIGINS` | `***REMOVED***` |
| `CSRF_TRUSTED_ORIGINS` | `***REMOVED***` |
| `RESEND_API_KEY` | (from .env.production) |
| `EMAIL_FROM` | `***REMOVED***` |
| `S3_ENDPOINT_URL` | (R2 endpoint from .env.production) |
| `S3_BUCKET` | `***REMOVED***` |
| `S3_ACCESS_KEY` | (from .env.production) |
| `S3_SECRET_KEY` | (from .env.production) |

## DNS Setup

Add a CNAME record for `api.mihas.edu.zm` pointing to your Koyeb service domain.

## Redis

Using **Upstash** serverless Redis (TLS):
- Host: `supreme-elf-35537.upstash.io:6379`
- Protocol: `rediss://` (TLS-encrypted)
- Connection string already set in `REDIS_URL` and `CELERY_BROKER_URL`
