"""The export row ceiling shared by the settlement, fee and tenant-audit exports.

It was declared in ``apps.documents.settlement_service`` (task 8.4) and read from
there by ``apps.catalog.tenant_audit_query_service`` (task 9.5), "so the platform
has one export size limit rather than one per surface". That read was a
module-level import of ``apps.documents`` from ``apps.catalog`` while
``apps.documents`` imports ``apps.catalog`` at module level, which made the two
packages circular (``scripts/check_circular_imports.py``). The constant now lives
here, below both packages; ``settlement_service`` re-exports it, so every
existing import of ``apps.documents.settlement_service.EXPORT_ROW_LIMIT`` still
works and still names the same value.
"""

from __future__ import annotations

#: Hard ceiling on an export, independent of page size (R6.5 "size limits").
#: An export that would exceed this is refused with ``EXPORT_TOO_LARGE`` rather
#: than silently truncated — a truncated financial export is worse than none.
EXPORT_ROW_LIMIT = 5000

__all__ = ["EXPORT_ROW_LIMIT"]
