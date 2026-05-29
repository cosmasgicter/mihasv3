"""File upload validators - magic byte verification + MIME type validation.

Implements task 16.1.
Requirements: 6.1, 11.7
"""

from rest_framework.exceptions import ValidationError

# Map of magic byte signatures to expected MIME types.
MAGIC_BYTES = {
    b"%PDF": "application/pdf",
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}

# Maximum bytes to read for magic byte detection.
MAX_MAGIC_LENGTH = max(len(sig) for sig in MAGIC_BYTES)

ALLOWED_MIME_TYPES = set(MAGIC_BYTES.values())


def validate_file_magic_bytes(file_obj, declared_mime_type):
    """Verify file content matches declared MIME type via magic bytes.

    Args:
        file_obj: An uploaded file object (InMemoryUploadedFile or similar).
        declared_mime_type: The MIME type declared by the client.

    Raises:
        ValidationError: If the file's magic bytes don't match any known
            signature, or if they don't match the declared MIME type.
    """
    if declared_mime_type not in ALLOWED_MIME_TYPES:
        raise ValidationError(
            f"Unsupported file type: {declared_mime_type}. "
            f"Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
        )

    # Read the first bytes for magic byte detection.
    file_obj.seek(0)
    header = file_obj.read(MAX_MAGIC_LENGTH)
    file_obj.seek(0)  # Reset for downstream consumers.

    if not header:
        raise ValidationError("Empty file uploaded.")

    # Check against known magic byte signatures.
    detected_mime = None
    for signature, mime_type in MAGIC_BYTES.items():
        if header[: len(signature)] == signature:
            detected_mime = mime_type
            break

    if detected_mime is None:
        raise ValidationError(
            "File content does not match any supported file type. "
            "Upload a PDF, JPEG, PNG, or GIF file."
        )

    if detected_mime != declared_mime_type:
        raise ValidationError(
            f"File content ({detected_mime}) does not match "
            f"declared type ({declared_mime_type})."
        )

    return detected_mime
