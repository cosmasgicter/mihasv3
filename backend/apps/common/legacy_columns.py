"""
Legacy column deprecation registry.

90-day deprecation cycle starting 2026-05-17, sunset date 2026-08-15.
See docs/runbooks/legacy-column-deprecation.md for the full process.
See backend/scripts/legacy_columns_drop_2026_08_15.sql for the drop migration.

Per AUDIT-REPORT-2026-04-24.md findings SSP-001, SSP-002, SSP-003.
"""

SUNSET_DATE = "2026-08-15"

LEGACY_DEPRECATED_COLUMNS = {
    "applications": {
        "payment_method": {
            "sunset_date": SUNSET_DATE,
            "reason": "Replaced by payments table; payment method lives on the Payment record",
            "replacement": "payments.method",
        },
        "payer_name": {
            "sunset_date": SUNSET_DATE,
            "reason": "PII that should not be stored on applications; available via payments table",
            "replacement": "payments.metadata (redacted)",
        },
        "payer_phone": {
            "sunset_date": SUNSET_DATE,
            "reason": "Raw phone number violates PII policy; payments stores phone_hash + phone_last4",
            "replacement": "payments.phone_hash / payments.phone_last4",
        },
        "amount": {
            "sunset_date": SUNSET_DATE,
            "reason": "Canonical amount lives on the Payment record",
            "replacement": "payments.amount",
        },
        "paid_at": {
            "sunset_date": SUNSET_DATE,
            "reason": "Canonical timestamp lives on the Payment record",
            "replacement": "payments.paid_at",
        },
        "momo_ref": {
            "sunset_date": SUNSET_DATE,
            "reason": "Transaction reference lives on the Payment record",
            "replacement": "payments.transaction_reference",
        },
        "pop_url": {
            "sunset_date": SUNSET_DATE,
            "reason": "Proof-of-payment upload removed; Lenco gateway is source of truth",
            "replacement": None,
        },
        "payment_verified_at": {
            "sunset_date": SUNSET_DATE,
            "reason": "Verification timestamp lives on the Payment record",
            "replacement": "payments.verified_at",
        },
        "payment_verified_by": {
            "sunset_date": SUNSET_DATE,
            "reason": "Verification actor lives on the Payment record or audit_logs",
            "replacement": "payments.verified_by_id / audit_logs",
        },
    },
    "profiles": {
        "refresh_token_hash": {
            "sunset_date": SUNSET_DATE,
            "reason": "Refresh tokens use Redis JTI blacklisting; hash column is unused",
            "replacement": "Redis JTI store",
        },
        "failed_login_attempts": {
            "sunset_date": SUNSET_DATE,
            "reason": "Rate limiting handled by DRF throttling; column is unused",
            "replacement": "DRF throttle classes",
        },
        "locked_until": {
            "sunset_date": SUNSET_DATE,
            "reason": "Account locking handled by DRF throttling; column is unused",
            "replacement": "DRF throttle classes",
        },
    },
    "error_logs": {
        "__entire_table__": {
            "sunset_date": SUNSET_DATE,
            "reason": "Replaced by GlitchTip (Sentry-compatible) error monitoring; table preserved but no longer written to",
            "replacement": "GlitchTip project 22431",
        },
    },
}


def get_deprecated_column_names(table: str) -> set[str]:
    """Return the set of deprecated column names for a given table."""
    entries = LEGACY_DEPRECATED_COLUMNS.get(table, {})
    return {k for k in entries if k != "__entire_table__"}


def is_entire_table_deprecated(table: str) -> bool:
    """Return True if the entire table is deprecated."""
    return "__entire_table__" in LEGACY_DEPRECATED_COLUMNS.get(table, {})
