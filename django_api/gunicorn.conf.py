"""Gunicorn production configuration for MIHAS Django API.

Requirements: 15.1, 20.5
- Graceful timeout of 30s for in-flight request completion during deployments
- Worker count configurable via WEB_CONCURRENCY env var (default 3)
- Separate Celery worker start command: celery -A config worker
"""

import os

# Bind to all interfaces on configurable port
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"

# Worker configuration
workers = int(os.environ.get("WEB_CONCURRENCY", "3"))
worker_class = "sync"
worker_connections = 1000

# Timeouts
graceful_timeout = 30  # Allow in-flight requests to complete during deploys
timeout = 120  # Kill workers that hang beyond 120s
keepalive = 5  # Keep TCP connections alive for 5s between requests

# Logging
accesslog = "-"  # stdout
errorlog = "-"  # stderr
loglevel = "info"

# Preload app for faster worker startup and shared memory
preload_app = True
