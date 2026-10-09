#!/usr/bin/env python3
"""L7 end-to-end probe: does a FALLBACK-RENDERED email still carry a legacy
tenant's brand?

GATE-13.4-01 was not filed from a catalogue fact. 13.4 §7.4 watched the payment
expiry sweep queue a real email whose subject read

    MIHAS Admissions - Payment Expired

to a real recipient address, through the ordinary reconciliation path. A row
count is therefore not the claim that needs proving; a rendered message is. This
probe renders one.

It exercises the real code, with no mocks and no fixtures:

  * ``CommunicationService.render_template(key, ctx, application=app)`` for EVERY
    ``communication_templates`` key, with an application whose institution does
    NOT resolve - i.e. the Beanola fallback path
    (``_resolve_institution_id`` -> None -> the ``institution_id IS NULL`` row).
  * the same body wrapped by ``get_base_email_html``, which is what
    ``CommunicationService.send`` actually queues, so the shell is scanned too.
  * ``render_message(type, ctx)`` for all 8 component-system message types, which
    is the OTHER email path (structure + visual identity) and is expected to have
    been neutral all along.

Then it does the part a one-sided measurement cannot: inside a transaction that
is UNCONDITIONALLY ROLLED BACK it restores the pre-L7 text, renders everything
again, and reports how many messages carried a legacy brand in that state. So
the before and the after are produced by the same instrument on the same
database in the same run.

Read-only in effect: the only writes happen inside ``transaction.atomic()``
blocks that are always rolled back, and the committed row count / brand count is
re-read and printed at the end as proof.

usage:  DATABASE_URL=<rehearsal dsn> python3 l7-render-probe.py
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[6] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.db import transaction  # noqa: E402

from apps.common.communication_service import (  # noqa: E402
    _DEFAULT_BRAND_NAME,
    _build_context,
    CommunicationService,
)
from apps.common.email.render import (  # noqa: E402
    available_message_types,
    render_message,
)
from apps.common.email_templates import get_base_email_html  # noqa: E402
from apps.common.models import CommunicationTemplate  # noqa: E402
from apps.catalog.services import InstitutionContextService  # noqa: E402

LEGACY = re.compile(r"MIHAS|KATC", re.IGNORECASE)


class _UnresolvedApplication:
    """An application whose institution does not resolve.

    This is the fallback case the finding is about: ``_resolve_institution_id``
    returns None, so ``_resolve_template`` lands on the ``institution_id IS NULL``
    platform row and ``_build_context`` substitutes the Beanola defaults. A
    non-UUID ``institution_ref_id`` and a non-Institution ``institution_ref`` are
    exactly what a brand-new tenant / an unresolved host produces.
    """

    id = "00000000-0000-0000-0000-0000000000ff"
    user_id = 1
    institution_ref_id = None
    institution_ref = None
    first_name = "Chipo"
    full_name = "Chipo Mwansa"
    email = "applicant@example.test"
    application_number = "APP-20260814-TESTONLY"
    program = "Diploma in Registered Nursing"
    intake = "January 2027 Intake"
    status = "submitted"
    public_tracking_code = "TRK-000000000000"


def _extra_context() -> dict:
    """Every placeholder any of the 33 templates uses, so nothing renders blank
    for a reason unrelated to branding."""
    return {
        "position": "3",
        "deadline_date": "2027-01-15",
        "days_until_expiry": "5",
        "document_name": "NRC",
        "document_list": "NRC, Result Slip",
        "application_list": "APP-20260814-TESTONLY",
        "condition_name": "Grade 12 certificate",
        "condition_description": "Submit the original Grade 12 certificate",
        "field_name": "phone",
        "amendment_status": "approved",
        "admin_feedback": "No further action is required.",
        "interview_date": "2026-09-01 10:00",
        "interview_mode": "in_person",
        "interview_location": "Main campus",
        "late_fee_amount": "K150.00",
        "remaining_attempts": "4",
    }


def render_all() -> tuple[list[tuple[str, str, str]], list[str]]:
    """Render every template key through the fallback path.

    Returns (branded, keys) where ``branded`` is a list of
    (template_key, where, offending 60-char window).
    """
    app = _UnresolvedApplication()
    ctx = _build_context(app, _extra_context())
    keys = sorted(
        CommunicationTemplate.objects.filter(institution_id__isnull=True)
        .values_list("template_key", flat=True)
    )
    branded: list[tuple[str, str, str]] = []
    for key in keys:
        subject, body = CommunicationService.render_template(key, ctx, application=app)
        wrapped = get_base_email_html(body, title=subject)
        for where, text in (("subject", subject), ("body", body), ("wrapped_email", wrapped)):
            m = LEGACY.search(text)
            if m:
                lo = max(0, m.start() - 25)
                branded.append((key, where, text[lo : m.end() + 25].replace("\n", " ")))
    return branded, keys


def render_component_system() -> list[tuple[str, str, str]]:
    """Render all 8 component-system message types (the structure/identity layer)."""
    ctx = {
        "student_name": "Chipo",
        "application_number": "APP-20260814-TESTONLY",
        "program_name": "Diploma in Registered Nursing",
        "intake_name": "January 2027 Intake",
        "receipt_number": "RCPT-000001",
        "amount": "150.00",
        "currency": "ZMW",
        "method": "mobile money",
        "interview_date": "2026-09-01",
        "interview_time": "10:00",
        "conditions": [{"description": "Grade 12 certificate", "deadline": "2027-01-15"}],
        "reset_url": "https://apply.beanola.com/reset?token=redacted",
        "document_type": "application_slip",
        "institution_name": "",
        "tracking_code": "TRK-000000000000",
    }
    branded: list[tuple[str, str, str]] = []
    for mtype in available_message_types():
        subject, html, text = render_message(mtype, ctx)
        for where, blob in (("subject", subject), ("html", html), ("text", text)):
            m = LEGACY.search(blob)
            if m:
                lo = max(0, m.start() - 25)
                branded.append((mtype, where, blob[lo : m.end() + 25].replace("\n", " ")))
    return branded


def quote_payment_expired() -> str:
    """The exact subject 13.4 §7.4 quoted, as it renders now."""
    app = _UnresolvedApplication()
    ctx = _build_context(app, _extra_context())
    subject, _ = CommunicationService.render_template("payment_expired", ctx, application=app)
    return subject


class _Rollback(Exception):
    pass


def revert_to_pre_l7() -> tuple[int, int, int]:
    """Restore the pre-L7 text. Caller MUST be inside a rolled-back atomic block."""
    from django.db import connection

    counts = []
    with connection.cursor() as cur:
        for sql in (
            """UPDATE communication_templates
                  SET subject_template = replace(subject_template,
                        'Beanola Admissions \u2014 ', 'MIHAS Admissions \u2014 ')
                WHERE institution_id IS NULL
                  AND subject_template LIKE '%Beanola Admissions \u2014 %'""",
            """UPDATE communication_templates
                  SET body_template = replace(body_template,
                        'Best regards,<br>Beanola Admissions</p>',
                        'Best regards,<br>MIHAS Admissions</p>')
                WHERE institution_id IS NULL
                  AND body_template LIKE '%Best regards,<br>Beanola Admissions</p>%'""",
            """UPDATE communication_templates
                  SET body_template = replace(body_template,
                        'We look forward to seeing you on campus.', 'Welcome to MIHAS!')
                WHERE institution_id IS NULL AND template_key = 'enrollment_confirmed'""",
        ):
            cur.execute(sql)
            counts.append(cur.rowcount)
    return tuple(counts)  # type: ignore[return-value]


def committed_state() -> tuple[int, int]:
    total = CommunicationTemplate.objects.count()
    branded = CommunicationTemplate.objects.raw(
        """SELECT id FROM communication_templates
            WHERE institution_id IS NULL
              AND (subject_template ILIKE '%%MIHAS%%' OR subject_template ILIKE '%%KATC%%'
                   OR body_template ILIKE '%%MIHAS%%' OR body_template ILIKE '%%KATC%%')"""
    )
    return total, len(list(branded))


def main() -> int:
    from django.db import connection

    print(f"database              : {connection.settings_dict['NAME']}")
    print(f"neutral brand source  : InstitutionContextService.BEANOLA_BRAND['name'] = "
          f"{InstitutionContextService.BEANOLA_BRAND['name']!r}")
    print(f"                        communication_service._DEFAULT_BRAND_NAME     = "
          f"{_DEFAULT_BRAND_NAME!r}")
    print()

    # ---- 1. the DB-driven fallback path, AFTER L7 -------------------------
    after_branded, keys = render_all()
    print("## 1. CommunicationService fallback render, AFTER L7")
    print(f"template keys rendered           : {len(keys)}")
    print(f"messages carrying MIHAS/KATC     : {len(after_branded)}")
    for key, where, window in after_branded:
        print(f"  ! {key} [{where}] ...{window}...")
    print(f"13.4's quoted subject renders as : {quote_payment_expired()!r}")
    print()

    # ---- 2. the component system (structure + visual identity) ------------
    comp_branded = render_component_system()
    print("## 2. render_message - the component system (subject + shell + text)")
    print(f"message types rendered           : {len(available_message_types())} "
          f"({', '.join(available_message_types())})")
    print(f"messages carrying MIHAS/KATC     : {len(comp_branded)}")
    for mtype, where, window in comp_branded:
        print(f"  ! {mtype} [{where}] ...{window}...")
    print()

    # ---- 3. the same instrument on the reproduced pre-L7 state ------------
    print("## 3. the SAME renders on the reproduced pre-L7 text")
    print("#    (inside transaction.atomic() that is unconditionally rolled back)")
    before_branded: list[tuple[str, str, str]] = []
    reverted = (0, 0, 0)
    before_subject = ""
    try:
        with transaction.atomic():
            reverted = revert_to_pre_l7()
            before_branded, _ = render_all()
            before_subject = quote_payment_expired()
            raise _Rollback
    except _Rollback:
        pass
    print(f"rows reverted (form1/form2/form3) : {reverted[0]} / {reverted[1]} / {reverted[2]}")
    print(f"messages carrying MIHAS/KATC     : {len(before_branded)}")
    distinct_keys = sorted({k for k, _, _ in before_branded})
    print(f"distinct template keys affected   : {len(distinct_keys)}")
    print(f"13.4's quoted subject rendered as : {before_subject!r}")
    print("first 6 offending renders:")
    for key, where, window in before_branded[:6]:
        print(f"  ! {key} [{where}] ...{window}...")
    print()

    # ---- 4. the transaction really was rolled back ------------------------
    total, branded = committed_state()
    print("## 4. committed state re-read after the rollback")
    print(f"communication_templates rows      : {total}")
    print(f"legacy-branded platform fallbacks : {branded}")
    print()

    ok = (
        len(after_branded) == 0
        and len(comp_branded) == 0
        and len(before_branded) > 0
        and branded == 0
    )
    print("VERDICT: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
