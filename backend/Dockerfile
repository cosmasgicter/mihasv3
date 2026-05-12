# MIHAS Django API - Production Dockerfile
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies: Tesseract OCR + PostgreSQL client libs + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Remove build tools no longer needed at runtime
RUN apt-get purge -y --auto-remove gcc && rm -rf /var/lib/apt/lists/*

# Copy project code
COPY . .

# Create non-root user and set ownership before collectstatic
RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app

# Default settings module for production
ENV DJANGO_SETTINGS_MODULE=config.settings.prod

# Collect static files (WhiteNoise serves them in production).
# These values are build-time, non-secret placeholders only so Django settings
# can import during `collectstatic`. Real runtime credentials must come from the
# container environment, `backend/.env`, `backend/.env.production`, or the
# deployment platform's secret manager.
RUN SECRET_KEY=build-time-placeholder \
    DATABASE_URL=postgres://build:build@localhost/build \
    REDIS_URL=redis://localhost:6379/0 \
    JWT_SIGNING_KEY=build-time-placeholder \
    ALLOWED_HOSTS=* \
    CORS_ALLOWED_ORIGINS=https://build-placeholder.example.com \
    RESEND_API_KEY=build-time-placeholder \
    S3_ENDPOINT_URL=https://build-placeholder.example.com \
    S3_BUCKET=build-placeholder \
    S3_ACCESS_KEY=build-placeholder \
    S3_SECRET_KEY=build-time-placeholder \
    LENCO_API_SECRET_KEY=build-time-placeholder \
    LENCO_PUBLIC_KEY=build-time-placeholder \
    AUDIT_LOG_ENCRYPTION_KEY=build-time-placeholder-key-0123456789ab \
    AI_GATEWAY_API_KEY=build-time-placeholder \
    python manage.py collectstatic --noinput

# Expose the application port expected by Koyeb and local container runs.
ENV PORT=8000 \
    WEB_CONCURRENCY=2
EXPOSE 8000

# Run as non-root user
USER app

CMD ["sh", "-c", "python manage.py apply_sql_migrations --no-color && python manage.py seed_subjects --no-color && python manage.py check_schema_drift --no-color && uvicorn config.asgi:application --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-3} --lifespan off --timeout-keep-alive 30"]
