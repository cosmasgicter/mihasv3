"""S3/R2 storage backend, signed URL generation, and shared key helpers.

A single boto3 S3 client is instantiated at module level and reused for
every signed URL request. Building a fresh client on each call (the
previous behaviour) re-parses service JSON, re-loads configuration, and
prevents HTTP connection pooling - adding tens to hundreds of
milliseconds of latency per request and exhausting file descriptors
under load.
"""

import threading
from urllib.parse import unquote, urlparse

import boto3
from botocore.config import Config
from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MediaStorage(S3Boto3Storage):
    """S3/R2 storage backend for media files."""

    location = "media"
    file_overwrite = False


# ---------------------------------------------------------------------------
# Cached boto3 S3 client
# ---------------------------------------------------------------------------

_s3_client = None
_s3_client_lock = threading.Lock()


def _build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_S3_SECRET_ACCESS_KEY,
        config=Config(
            signature_version="s3v4",
            # Conservative pool - tune via env if needed under load.
            max_pool_connections=int(getattr(settings, "AWS_S3_MAX_POOL_CONNECTIONS", 50)),
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def get_s3_client():
    """Return the cached S3 client, building it lazily on first use.

    Lazy + double-checked locking keeps Django start-up fast and avoids
    constructing a client during settings import on workers that never
    touch storage (e.g. some Celery beat replicas).
    """

    global _s3_client
    if _s3_client is not None:
        return _s3_client
    with _s3_client_lock:
        if _s3_client is None:
            _s3_client = _build_s3_client()
    return _s3_client


def reset_s3_client():
    """Test-only helper to drop the cached client."""

    global _s3_client
    with _s3_client_lock:
        _s3_client = None


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------


def _get_presigned_object_key(file_key):
    """Convert a MediaStorage-relative name into the real S3/R2 object key."""
    key = str(file_key or "").lstrip("/")
    location = MediaStorage.location.strip("/")
    if location and key and not key.startswith(f"{location}/"):
        return f"{location}/{key}"
    return key


def get_document_storage_key(document):
    """Convert persisted ``ApplicationDocument.file_url`` into a MediaStorage-relative key.

    Accepts:
      * Full https URLs (``https://bucket.r2.cloudflarestorage.com/media/foo``)
      * Bucket-prefixed paths (``bucket/media/foo``)
      * MediaStorage-relative keys (``foo`` or ``media/foo``)

    Returns a key suitable for ``MediaStorage().open(key)`` and
    ``generate_signed_url(key)`` - strips any duplicated bucket and
    location prefixes so callers never get ``media/media/...``.
    """
    raw_file_url = (getattr(document, "file_url", None) or "").strip()
    if not raw_file_url:
        return ""

    if raw_file_url.startswith(("http://", "https://")):
        key = unquote(urlparse(raw_file_url).path.lstrip("/"))
    else:
        key = raw_file_url.lstrip("/")

    bucket_name = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
    if bucket_name and key.startswith(f"{bucket_name}/"):
        key = key[len(bucket_name) + 1:]

    # MediaStorage uses location='media', so strip the prefix to avoid media/media/...
    if key.startswith("media/"):
        key = key[len("media/"):]

    return key


# Backwards-compatible alias for the existing private name still used by
# legacy views that have not yet been updated to the public symbol.
_get_document_storage_key = get_document_storage_key


# ---------------------------------------------------------------------------
# Signed URL generation
# ---------------------------------------------------------------------------


def generate_signed_url(file_key, expiry=None):
    """Generate a time-limited signed URL for a file.

    Args:
        file_key: MediaStorage-relative file key or full S3/R2 object key.
        expiry: URL expiry in seconds. Defaults to AWS_QUERYSTRING_EXPIRE
            (typically 900s = 15 min).

    Returns:
        A presigned URL string for the given file key.
    """
    expiry = expiry or settings.AWS_QUERYSTRING_EXPIRE  # 900 seconds = 15 min

    return get_s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
            "Key": _get_presigned_object_key(file_key),
        },
        ExpiresIn=expiry,
    )
