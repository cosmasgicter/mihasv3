"""S3/R2 storage backend and signed URL generation.

Implements task 6.7.
Requirements: 21.1, 21.2, 21.3
"""

import boto3
from botocore.config import Config
from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MediaStorage(S3Boto3Storage):
    """S3/R2 storage backend for media files."""

    location = "media"
    file_overwrite = False


def _get_presigned_object_key(file_key):
    """Convert a MediaStorage-relative name into the real S3/R2 object key."""
    key = str(file_key or "").lstrip("/")
    location = MediaStorage.location.strip("/")
    if location and key and not key.startswith(f"{location}/"):
        return f"{location}/{key}"
    return key


def generate_signed_url(file_key, expiry=None):
    """Generate a time-limited signed URL for a file.

    Args:
        file_key: MediaStorage-relative file key or full S3/R2 object key.
        expiry: URL expiry in seconds. Defaults to AWS_QUERYSTRING_EXPIRE (900s = 15 min).

    Returns:
        A presigned URL string for the given file key.
    """
    expiry = expiry or settings.AWS_QUERYSTRING_EXPIRE  # 900 seconds = 15 min

    client = boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )

    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": _get_presigned_object_key(file_key)},
        ExpiresIn=expiry,
    )
