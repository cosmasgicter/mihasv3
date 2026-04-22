"""Structured logging helpers for request-aware JSON logs."""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone


_request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
_request_path_ctx: ContextVar[str | None] = ContextVar("request_path", default=None)
_request_method_ctx: ContextVar[str | None] = ContextVar("request_method", default=None)


def bind_request_context(*, request_id: str | None, method: str | None = None, path: str | None = None) -> None:
    """Bind request metadata into contextvars for log enrichment."""
    _request_id_ctx.set(request_id)
    _request_method_ctx.set(method)
    _request_path_ctx.set(path)


def clear_request_context() -> None:
    """Clear request metadata after the request completes."""
    bind_request_context(request_id=None, method=None, path=None)


class RequestContextFilter(logging.Filter):
    """Attach request contextvars to log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_ctx.get()
        record.request_method = _request_method_ctx.get()
        record.request_path = _request_path_ctx.get()
        return True


class JsonLogFormatter(logging.Formatter):
    """Emit logs as compact JSON for aggregation and incident response."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = getattr(record, "request_id", None)
        request_method = getattr(record, "request_method", None)
        request_path = getattr(record, "request_path", None)
        if request_id:
            payload["request_id"] = request_id
        if request_method:
            payload["request_method"] = request_method
        if request_path:
            payload["request_path"] = request_path

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        # Merge structured metric fields into the JSON payload so fields
        # like type, method, path, status_code, duration_ms appear as
        # top-level keys in the log line. These are passed via the `extra`
        # kwarg to logger.info() and set as attributes on the LogRecord.
        _EXTRA_FIELDS = (
            "type", "method", "path", "status_code", "duration_ms",
            "metric", "amount", "currency", "application_id", "program",
            "event", "task_name", "task_id", "error",
            "expected_interval_seconds", "last_run_at",
        )
        for field in _EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        return json.dumps(payload, default=str)
