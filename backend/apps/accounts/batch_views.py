"""Batch user import — re-export shim (rebuilt by admissions-v2 task 9.3).

The implementation moved to :mod:`apps.accounts.user_directory_views` (the view)
and :mod:`apps.accounts.user_import_service` (the command), because finding
**ADM-04** was not a bug inside this file — it was the absence of a service:
validation, tenant binding, atomicity, and row-level reporting all lived inline
in one ``post`` handler, so there was no way to run the validation *without*
importing, which is what a preview is.

What changed, for anyone following an old import here:

* ``POST /api/v1/admin/users/batch-import/`` now takes
  ``{institution_id, mode, rows[]}`` rather than a bare array, and binds every
  created account to the named school with an active membership.
* ``POST /api/v1/admin/users/batch-import/preview/`` runs the same validator and
  writes nothing.
* Atomicity is declared: ``mode`` is ``all_or_nothing`` (default) or ``per_row``.
* Row errors carry a stable ``code`` and a **1-based** row number matching the
  operator's file, instead of ``{"index": null}``.
* The audit row keeps ``action="user_batch_import"`` and records email
  **fingerprints** instead of the addresses themselves.

Compatibility owner: Beanola platform engineering.
Removal condition: no module imports ``apps.accounts.batch_views``.
"""

from apps.accounts.user_directory_views import (  # noqa: F401
    AdminUserBatchImportView,
    AdminUserImportPreviewView,
)
from apps.accounts.user_directory_service import (  # noqa: F401
    IMPORT_MAX_ROWS as MAX_BATCH_SIZE,
    SUPPORTED_ROLES as VALID_ROLES,
)

#: Historical alias. The batch-import view is the canonical name.
BatchUserImportView = AdminUserBatchImportView

COMPATIBILITY_OWNER = "Beanola platform engineering"
REMOVAL_CONDITION = "Remove once nothing imports apps.accounts.batch_views."

__all__ = [
    "AdminUserBatchImportView",
    "AdminUserImportPreviewView",
    "BatchUserImportView",
    "COMPATIBILITY_OWNER",
    "MAX_BATCH_SIZE",
    "REMOVAL_CONDITION",
    "VALID_ROLES",
]
