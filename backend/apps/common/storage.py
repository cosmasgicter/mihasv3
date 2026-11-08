"""S3/R2 storage backend, signed URL generation, and shared key helpers.

A single boto3 S3 client is instantiated at module level and reused for
every signed URL request. Building a fresh client on each call (the
previous behaviour) re-parses service JSON, re-loads configuration, and
prevents HTTP connection pooling - adding tens to hundreds of
milliseconds of latency per request and exhausting file descriptors
under load.
"""

import logging
import re
import threading
from urllib.parse import parse_qsl, unquote, urlparse

import boto3
from botocore.config import Config
from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


logger = logging.getLogger(__name__)


class MediaStorage(S3Boto3Storage):
    """S3/R2 storage backend for media files."""

    location = "media"
    file_overwrite = False


# ---------------------------------------------------------------------------
# Cached boto3 S3 client
# ---------------------------------------------------------------------------

_s3_client = None
_s3_client_lock = threading.Lock()


def _build_s3_client(endpoint_url=None):
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL if endpoint_url is None else endpoint_url,
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


_presign_client = None


def get_presign_client():
    """Return the cached client used only to compute presigned URLs.

    Built like the internal client but against ``AWS_S3_PUBLIC_ENDPOINT_URL``,
    the host the browser can reach. Signing is a local computation, so that
    host need not be reachable from the backend. Where the public endpoint is
    unset it equals the internal one (production).
    """
    global _presign_client
    if _presign_client is not None:
        return _presign_client
    with _s3_client_lock:
        if _presign_client is None:
            _presign_client = _build_s3_client(
                getattr(settings, "AWS_S3_PUBLIC_ENDPOINT_URL", "") or settings.AWS_S3_ENDPOINT_URL
            )
    return _presign_client


def reset_s3_client():
    """Test-only helper to drop the cached clients."""
    global _s3_client, _presign_client
    with _s3_client_lock:
        _s3_client = None
        _presign_client = None


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


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def is_snapshot_presence_marker(value):
    """True for a bare UUID: an application snapshot id, never a file reference."""
    return isinstance(value, str) and bool(_UUID_RE.match(value.strip()))


class _PersistedValue:
    """Adapts one persisted value to ``get_document_storage_key``'s input."""

    def __init__(self, value):
        self.file_url = value


def _our_hosts():
    hosts = set()
    for name in ("AWS_S3_ENDPOINT_URL", "AWS_S3_PUBLIC_ENDPOINT_URL"):
        host = (urlparse(getattr(settings, name, "") or "").hostname or "").lower()
        if host:
            hosts.add(host)
    bucket_name = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
    if bucket_name:
        for host in list(hosts):
            hosts.add(f"{bucket_name}.{host}".lower())
    return hosts


def _key_from_persisted_value(value):
    """Resolve a persisted ``file_url`` / ``storage_key`` value to a key.

    Returns ``None`` for a snapshot presence marker (a bare UUID), for a
    legacy-provider URL, and for anything that is not a file reference.
    """
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    if _UUID_RE.match(raw):
        return None
    if "://" not in raw:
        return get_document_storage_key(_PersistedValue(raw)) or None
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    has_signature = any(
        name.startswith("X-Amz-") for name, _ in parse_qsl(parsed.query, keep_blank_values=True)
    )
    if has_signature or parsed.hostname.lower() in _our_hosts():
        # Our own (possibly presigned) URL: the decoded path is the key.
        return get_document_storage_key(_PersistedValue(raw)) or None
    return None


def resolve_document_object_key(document):
    """The object key for ``document``: ``storage_key``, else derived from ``file_url``."""
    stored = _key_from_persisted_value(getattr(document, "storage_key", None))
    if stored:
        return stored
    file_url = getattr(document, "file_url", None)
    if isinstance(file_url, str) and file_url.strip() and _key_from_persisted_value(file_url) is None:
        # A presence marker or a legacy-provider URL: not an object in our bucket.
        return ""
    # Our key or our own URL: ``get_document_storage_key`` derives it, as it
    # always has for this value (design R4-c composes it).
    return get_document_storage_key(document) or ""


def _legacy_provider_url(document):
    raw = str(getattr(document, "file_url", None) or "").strip()
    if raw.startswith("https://") and not _key_from_persisted_value(raw):
        return raw
    return None


def resolve_document_open_url(document, *, disposition="inline"):
    """A URL the browser can open now: signed at call time, or a legacy URL unchanged.

    Returns ``None`` when the document has no resolvable file. Signing errors
    propagate so callers choose how to present them.
    """
    key = resolve_document_object_key(document)
    if key:
        return generate_signed_url(key)
    legacy = None if getattr(document, "storage_key", None) else _legacy_provider_url(document)
    if legacy:
        logger.info(
            "document.open.legacy_provider",
            extra={"document_id": str(getattr(document, "id", ""))},
        )
        return legacy
    return None


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

    return get_presign_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
            "Key": _get_presigned_object_key(file_key),
        },
        ExpiresIn=expiry,
    )
