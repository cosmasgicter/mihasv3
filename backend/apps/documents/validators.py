"""File upload validators - magic byte verification + MIME type validation.

Implements task 16.1.
Requirements: 6.1, 11.7
"""

import re

from rest_framework.exceptions import ValidationError

# Map of magic byte signatures to expected MIME types.
MAGIC_BYTES = {
    b"%PDF": "application/pdf",
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG": "image/png",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
    b"RIFF": "image/webp",
}

# Maximum bytes to read for magic byte detection.
MAX_MAGIC_LENGTH = max(len(sig) for sig in MAGIC_BYTES)

ALLOWED_MIME_TYPES = set(MAGIC_BYTES.values())
ALLOWED_ASSET_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}

# Maximum bytes of an SVG asset scanned for active/unsafe content. Brand SVGs
# (logos/signatures/seals) are small; scanning the first 256 KiB is ample to
# catch embedded scripts/handlers without loading an unbounded upload into
# memory. The size guard in the upload view already caps total bytes at 2 MiB.
_MAX_SVG_SCAN_BYTES = 256 * 1024

# Active / unsafe SVG constructs that must never be stored, because a stored
# SVG asset is reachable via its ``public_url`` and a browser would execute
# them (R6.7: never execute untrusted SVG). Matched case-insensitively against
# the decoded SVG text. These cover scriptable elements, inline event
# handlers, ``javascript:`` URIs, external/foreign references, and DOCTYPE /
# ENTITY blocks (XXE / billion-laughs vectors).
_UNSAFE_SVG_PATTERNS = (
    re.compile(rb"<\s*script", re.IGNORECASE),
    re.compile(rb"<\s*foreignobject", re.IGNORECASE),
    re.compile(rb"<\s*(?:!doctype|!entity)", re.IGNORECASE),
    re.compile(rb"<\s*!\[cdata\[", re.IGNORECASE),
    # An inline event handler: an HTML/SVG attribute named ``on...`` set to a
    # value, e.g. ``onload="..."`` / ``onclick='...'``.
    re.compile(rb"\son\w+\s*=", re.IGNORECASE),
    re.compile(rb"javascript\s*:", re.IGNORECASE),
)


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
            if mime_type == "image/webp" and header[8:12] != b"WEBP":
                continue
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


def validate_asset_magic_bytes(file_obj, declared_mime_type):
    """Validate versioned tenant assets by MIME and magic bytes."""
    if declared_mime_type not in ALLOWED_ASSET_MIME_TYPES:
        raise ValidationError(
            f"Unsupported asset type: {declared_mime_type}. "
            f"Allowed types: {', '.join(sorted(ALLOWED_ASSET_MIME_TYPES))}"
        )

    file_obj.seek(0)
    header = file_obj.read(512)
    file_obj.seek(0)
    if not header:
        raise ValidationError("Empty file uploaded.")

    if declared_mime_type == "image/svg+xml":
        lowered = header.lstrip().lower()
        if lowered.startswith(b"<?xml"):
            if b"<svg" not in lowered:
                return _raise_invalid_asset()
        elif not lowered.startswith(b"<svg"):
            return _raise_invalid_asset()
        # The 512-byte header confirms this is an SVG; now scan a bounded
        # window of the *full* body for active/unsafe content. A script or
        # event handler can appear anywhere in the file, not just the header,
        # and a stored SVG is reachable via its public URL where a browser
        # would execute it (R6.7: never execute untrusted SVG).
        _reject_unsafe_svg(file_obj)
        return "image/svg+xml"

    if declared_mime_type == "image/webp":
        if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
            return "image/webp"
        return _raise_invalid_asset()

    detected_mime = None
    for signature, mime_type in MAGIC_BYTES.items():
        if mime_type == "image/webp":
            continue
        if header[: len(signature)] == signature:
            detected_mime = mime_type
            break
    if detected_mime != declared_mime_type:
        return _raise_invalid_asset()
    return detected_mime


def _raise_invalid_asset():
    raise ValidationError("Asset file content does not match the declared image type.")


def _reject_unsafe_svg(file_obj):
    """Reject SVG assets carrying active/unsafe content (R6.7).

    Scans a bounded window of the SVG body for scriptable elements, inline
    event handlers, ``javascript:`` URIs, ``<foreignObject>``, and
    DOCTYPE/ENTITY/CDATA blocks. A stored SVG is served from its ``public_url``
    where a browser would execute such content, so any match is treated as a
    mismatched/invalid upload and surfaced under the stable ``ASSET_INVALID``
    code by the caller. Leaves the file position reset for downstream
    consumers (checksum, storage).
    """
    file_obj.seek(0)
    body = file_obj.read(_MAX_SVG_SCAN_BYTES)
    file_obj.seek(0)
    for pattern in _UNSAFE_SVG_PATTERNS:
        if pattern.search(body):
            raise ValidationError(
                "SVG asset contains active or unsafe content and cannot be stored."
            )
