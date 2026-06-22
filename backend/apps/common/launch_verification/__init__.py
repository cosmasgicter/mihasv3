"""Launch-verification evidence harness (Beanola).

This package holds the shared building blocks for the launch-verification
evidence gates described in
``.kiro/specs/beanola-launch-verification/``:

* :mod:`redaction` - the shared secret/PII redaction helper that **every**
  gate must write its Evidence_Artifact through, so that no connection
  string, credential, raw phone number, NRC/passport value, or document
  body ever reaches a persisted artifact (Requirements 1.9, 9.4, 9.9).
* ``evidence`` - the common Evidence_Artifact envelope and (de)serialize
  helpers (added by task 1.1).

The redaction helper is intentionally import-light (standard library only,
no Django imports) so it can be reused from CLI gate scripts under
``scripts/launch-verification/`` as well as Django-side code.
"""

from __future__ import annotations

from apps.common.launch_verification.redaction import (
    REDACTION_MARKER,
    redact,
    redact_obj,
    redact_text,
)

__all__ = [
    "REDACTION_MARKER",
    "redact",
    "redact_obj",
    "redact_text",
]
