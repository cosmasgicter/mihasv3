# Deterministic local adapters (payment + domain + operational observer).
# Stdlib-only — no pip install, no dependencies, no credentials.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    ADAPTER_PORT=9099

WORKDIR /app
COPY adapter_server.py /app/adapter_server.py

EXPOSE 9099

# Liveness for the compose healthcheck (python, since slim has no curl).
HEALTHCHECK --interval=5s --timeout=3s --retries=10 --start-period=5s \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9099/__/health',timeout=3).status==200 else 1)"]

CMD ["python", "/app/adapter_server.py"]
