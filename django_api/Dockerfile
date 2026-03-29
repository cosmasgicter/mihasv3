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

# Copy project code
COPY . .

# Default settings module for production
ENV DJANGO_SETTINGS_MODULE=config.settings.prod

# Collect static files (WhiteNoise serves them in production)
RUN SECRET_KEY=build-placeholder \
    DATABASE_URL=postgres://placeholder:placeholder@localhost/placeholder \
    REDIS_URL=redis://localhost:6379/0 \
    JWT_SIGNING_KEY=build-placeholder \
    ALLOWED_HOSTS=* \
    CORS_ALLOWED_ORIGINS=https://placeholder.example.com \
    RESEND_API_KEY=build-placeholder \
    S3_ENDPOINT_URL=https://placeholder.example.com \
    S3_BUCKET=placeholder \
    S3_ACCESS_KEY=placeholder \
    S3_SECRET_KEY=placeholder \
    python manage.py collectstatic --noinput

# Expose configurable port (default 8000)
ENV PORT=8000
EXPOSE ${PORT}

CMD gunicorn config.wsgi:application --config gunicorn.conf.py
