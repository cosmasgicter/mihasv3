"""Seed the MIHAS RN, KATC COG, and KATC EHT acceptance-letter profiles.

Run: python manage.py seed_tenant_document_profiles
     python manage.py seed_tenant_document_profiles --dry-run   (validate only)

This command moves the rich, school-specific acceptance-letter content out of
the frontend (``apps/admissions/src/lib/pdf/documents/acceptanceLetterProfiles.ts``
+ ``intakeSchedule.ts``) and into backend tenant configuration as
``InstitutionDocumentProfile`` rows (R8.4 / design.md Component 4). The data is
configurable tenant rows — NOT tests, NOT frontend constants.

Idempotency: ``update_or_create`` keyed on
``(institution, document_type, program, canonical_program, intake, version)`` so
re-running refreshes the same three rows rather than duplicating them.

Safety: every payload is run through ``validate_profile_payload`` before any DB
write, so seeded data is provably within the Safe_Template_Policy (allowlisted
tokens only, structural caps, valid fee/bank row shapes).

Brand note: this is allowlisted seed/fixture data — MIHAS/KATC are legitimate
tenant fixtures here (R10.2). The MIHAS/KATC strings below are expected and
confined to this seed file; they are added to the brand allowlist in task 21.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

DOCUMENT_TYPE = "acceptance_letter"
PROFILE_VERSION = 1

# Default signatory — Dr Solomon Musonda, MD, is the Managing Director for both
# MIHAS and KATC (mirrors ``signature_block`` in apps/common/email/components.py
# and DEFAULT_SIGNATORY in the frontend PDF system).
_DEFAULT_SIGNATORY = {
    "name": "Dr Solomon Musonda",
    "role": "Managing Director",
    "postnominal": "MD",
}

# Shared Zanaco branch data transcribed verbatim from the official sample
# letters (COMMON_BANK in acceptanceLetterProfiles.ts).
_COMMON_BANK = {
    "bank_name": "Zambia National Commercial Bank (Zanaco)",
    "branch": "Mukuba Mall",
    "branch_code": "098",
    "swift_code": "Zncozmlu",
    "sort_code": "010298",
}

_KATC_ACCOUNT_NAME = "Kalulushi Training Centre"
_MIHAS_ACCOUNT_NAME = "Mukuba Institute of Health and Applied Sciences"


def _bank(label: str, account_name: str, account_number: str) -> dict[str, Any]:
    return {
        "label": label,
        "account_name": account_name,
        "account_number": account_number,
        **_COMMON_BANK,
    }


# --------------------------------------------------------------------------- #
# Profile specs — transcribed VERBATIM from the three official sample letters.
# Each spec resolves its institution by code and (optionally) its offering by a
# program-name substring within that institution, so KATC's two offerings
# (COG, EHT) get distinct offering-scoped rows rather than ambiguous defaults.
# --------------------------------------------------------------------------- #
PROFILE_SPECS: list[dict[str, Any]] = [
    # ---- MIHAS — Diploma in Registered Nursing (RN), full time -------------
    {
        "key": "MIHAS_RN",
        "institution_code": "MIHAS",
        "institution_defaults": {
            "name": "Mukuba Institute of Health and Applied Sciences",
            "full_name": "Mukuba Institute of Health and Applied Sciences",
            "type": "Private College",
        },
        "program_name_contains": "registered nursing",
        "program_code": "DRN",
        "program_name": "Diploma in Registered Nursing",
        "layout_key": "fee_chart_letter",
        "sections": {
            "body": (
                "Dear {{student_name}},\n\n"
                "REF: ADMISSION INTO THE DIPLOMA IN REGISTERED NURSING (RN) — "
                "FULL TIME, {{intake}}\n\n"
                "We are pleased to inform you that your application to study the "
                "{{program}} full time at {{institution}} was successful. You are "
                "expected to report on the 6th of July for registration. The "
                "K1,000 commitment fee is a non-refundable deposit paid into the "
                "school's tuition account to secure your place and is treated as "
                "part-payment toward tuition."
            ),
            "notes": (
                "Tuition fees for the Diploma in Registered Nursing first year, "
                "first semester are K8,000. A 50% bursary is applied, so you are "
                "required to pay only K4,000.\n\n"
                "Other fees for the first year, first semester are K4,200. This "
                "amount includes Registration, Maintenance Fee, Medical Fees, "
                "Library Fees, Computer Laboratory, Objective Structured Clinical "
                "Examination (OSCE), Internal Exams, Recreation Activities, "
                "E.C.Z. Results Verification, Administrative Cost/Attachments, "
                "Rural Primary Health Care and Psychiatry.\n\n"
                "G.N.C. payment (ZANACO account 5768098500592) is a one-off "
                "payment made to GNC via the school at the time of indexing: "
                "G.N.C. Indexing K364, G.N.C. School Rules K40, Learner's Guide "
                "K273, Procedure Manuals K273, Evaluation Manual K221, Code of "
                "Conduct K100, Administrative fees K61 — total K1,332.00.\n\n"
                "Mukuba Institute of Health and Applied Sciences provides "
                "accommodation at a fee of K650 per month to full time students "
                "(ZANACO, Mukuba Mall, A/C No 5768098500390). Accommodation is "
                "optional and is not included in the intake total."
            ),
        },
        "fee_chart": [
            {"item": "Tuition fees (first year, first semester)", "amount": 8000, "cadence": "Per semester", "account": "5768098500188", "in_total": False},
            {"item": "Less: 50% bursary on tuition", "amount": -4000, "kind": "deduction", "cadence": "Awarded to every admitted student", "in_total": False},
            {"item": "Tuition payable after bursary", "amount": 4000, "kind": "subtotal", "emphasis": True, "account": "5768098500188"},
            {"item": "Other fees (first year, first semester)", "amount": 4200, "cadence": "Per semester", "account": "5768098500289"},
            {"item": "G.N.C. indexing & manuals", "amount": 1332, "cadence": "Once off — paid to GNC via the school", "account": "5768098500592"},
            {"item": "Accommodation (full time students)", "amount": 650, "cadence": "Per month — optional", "account": "5768098500390", "optional": True},
        ],
        "bank_accounts": [
            _bank("Tuition fees", _MIHAS_ACCOUNT_NAME, "5768098500188"),
            _bank("Other fees", _MIHAS_ACCOUNT_NAME, "5768098500289"),
        ],
        "requirements": [
            "Two reams of plain (bond) paper A4 (Rotatrim)",
            "A nurse's watch",
            "A nurse's scissors with a chain",
            "A nurse's dictionary",
            "A clinical mercury thermometer",
            "1 box of examination gloves and 1 box of surgical gloves",
            "Roll of cotton wool (500g) / gauze",
            "Three (3) passport photos (taken in natural hair)",
            "Marriage certificate if applicable",
            "1 unit of tissue rolls",
            "1 bottle Jik",
            "Liquid hand soap",
            "Sanitizer",
            "Medical certificate",
            "2 suspension files",
        ],
        "rules": {"study_mode": "Full Time", "program_code": "RN", "commitment_fee_zmw": 1000},
    },
    # ---- KATC — Diploma in Clinical Medicine (COG), full time --------------
    {
        "key": "KATC_COG",
        "institution_code": "KATC",
        "institution_defaults": {
            "name": "Kalulushi Training Centre",
            "full_name": "Kalulushi Training Centre",
            "type": "Private College",
        },
        "program_name_contains": "clinical medicine",
        "program_code": "KATC-COG",
        "program_name": "Diploma in Clinical Medicine",
        "layout_key": "fee_chart_letter",
        "sections": {
            "body": (
                "Dear {{student_name}},\n\n"
                "REF: ADMISSION INTO THE DIPLOMA IN CLINICAL MEDICINE (COG) — "
                "FULL TIME, {{intake}}\n\n"
                "We are pleased to inform you that your application to study the "
                "{{program}} full time at {{institution}} was successful. You are "
                "expected to report on the 29th of June for registration; the "
                "commitment-fee deadline is the 9th of May. The K1,000 commitment "
                "fee is a non-refundable deposit paid into the school's tuition "
                "account to secure your place."
            ),
            "notes": (
                "Registration will run from 29th June to 3rd July. Late "
                "registration will attract a penalty fee of K500.\n\n"
                "Other fees are paid per semester or per year into the school "
                "account 5729097500226 (Kalulushi Training Centre, Zanaco, "
                "Mukuba Mall).\n\n"
                "Accommodation (self-catering) and the per-year UNZA affiliation "
                "fee are optional and are not included in the intake total."
            ),
        },
        "fee_chart": [
            {"item": "Tuition fees", "amount": 7500, "cadence": "Per semester", "account": "5729097500125"},
            {"item": "HPCZ indexing", "amount": 300, "cadence": "Once off", "account": "5729097500226"},
            {"item": "Student ID", "amount": 150, "cadence": "Once off", "account": "5729097500226"},
            {"item": "Uniform", "amount": 500, "cadence": "Once off", "account": "5729097500226"},
            {"item": "Lab coat", "amount": 300, "cadence": "Once off", "account": "5729097500226"},
            {"item": "Friday T-shirt", "amount": 300, "cadence": "Once off", "account": "Cash payment"},
            {"item": "UNZA affiliation", "amount": 450, "cadence": "Per year — optional", "account": "5729097500226", "optional": True},
            {"item": "Accommodation (self-catering)", "amount": 650, "cadence": "Per month — optional", "account": "Cash payment", "optional": True},
        ],
        "bank_accounts": [
            _bank("Tuition fees", _KATC_ACCOUNT_NAME, "5729097500125"),
            _bank("Other fees", _KATC_ACCOUNT_NAME, "5729097500226"),
        ],
        "requirements": [
            "Two reams of plain (bond) paper A4 (Rotatrim)",
            "Two certified (ECZ) Grade 12 results",
            "Four passport size photos",
            "1 dozen of tissue",
            "BP machine (personal use)",
            "Stethoscope (personal use)",
            "1 tin of Cobra (500ml)",
            "Adequate hard cover books (personal use)",
            "Examination gloves",
            "Surgical gloves",
            "Gauze roll",
            "Hand wash bottle",
            "Thermometer",
            "Suspension file",
            "Bottle of Jik (750ml)",
            "Bottle of spirit",
            "One mop",
            "One hard broom",
            "Hand sanitizer",
        ],
        "rules": {"study_mode": "Full Time", "program_code": "COG", "commitment_fee_zmw": 1000},
    },
    # ---- KATC — Diploma in Environmental Health (EHT), distance ------------
    {
        "key": "KATC_EHT",
        "institution_code": "KATC",
        "institution_defaults": {
            "name": "Kalulushi Training Centre",
            "full_name": "Kalulushi Training Centre",
            "type": "Private College",
        },
        "program_name_contains": "environmental health",
        "program_code": "KATC-EHT",
        "program_name": "Diploma in Environmental Health",
        "layout_key": "fee_chart_letter",
        "sections": {
            "body": (
                "Dear {{student_name}},\n\n"
                "REF: ADMISSION INTO THE DIPLOMA IN ENVIRONMENTAL HEALTH "
                "(CHA-EHT) — DISTANCE, {{intake}}\n\n"
                "We are pleased to inform you that your application to study the "
                "{{program}} by distance at {{institution}} was successful. You "
                "are expected to report on the 29th of June; the commitment-fee "
                "deadline is the 29th of May. The K1,000 commitment fee is a "
                "non-refundable deposit paid into the school's tuition account to "
                "secure your place."
            ),
            "notes": (
                "Other fees are paid per semester or per year into the school "
                "account 5729097500226 (Kalulushi Training Centre, Zanaco, "
                "Mukuba Mall).\n\n"
                "Other fees payable per semester differ according to activities "
                "in that particular semester during the three-year course "
                "duration. For the first year, first semester this amount "
                "includes Registration, Identity Cards, Maintenance Fee, Medical "
                "Fees, Library Fees, Computer Laboratory, Objective Structured "
                "Clinical Examination (OSCE), Internal Exams, Recreation "
                "Activities, E.C.Z. Results Verification, and Administrative Cost "
                "for Manuals and practicum Attachments.\n\n"
                "The per-year UNZA affiliation fee is optional and is not "
                "included in the intake total."
            ),
        },
        "fee_chart": [
            {"item": "Tuition fees", "amount": 8500, "account": "5729097500630"},
            {"item": "HPCZ indexing", "amount": 300, "account": "5729097500226"},
            {"item": "Student ID", "amount": 150, "account": "5729097500226"},
            {"item": "Uniform", "amount": 500, "account": "5729097500226"},
            {"item": "Lab coat", "amount": 300, "account": "5729097500226"},
            {"item": "Friday T-shirt", "amount": 300, "account": "Cash payment"},
            {"item": "Registration fee", "amount": 500, "account": "5729097500226"},
            {"item": "UNZA affiliation", "amount": 450, "cadence": "Per year — optional", "account": "5729097500226", "optional": True},
        ],
        "bank_accounts": [
            _bank("Tuition fees", _KATC_ACCOUNT_NAME, "5729097500630"),
            _bank("Other fees", _KATC_ACCOUNT_NAME, "5729097500226"),
        ],
        "requirements": [
            "Two reams of plain (bond) paper A4 (Rotatrim)",
            "Two copies of certified Grade 12 results (ECZ)",
            "4 passport size photos",
            "1 work suit (Navy Blue with reflectors)",
            "One pair of safety boots",
            "1 dozen of tissue",
            "1 tin of Cobra (500ml)",
            "Drawing board with geometric set",
            "Adequate hard cover books",
            "Examination gloves",
            "Suspension file",
            "Bottle of Jik",
            "Bottle of spirit",
            "Hand wash",
            "Hand sanitizer",
            "One standing mop",
            "One slasher",
        ],
        "rules": {"study_mode": "Distance", "program_code": "EHT", "commitment_fee_zmw": 1000},
    },
]


class Command(BaseCommand):
    help = (
        "Seed the MIHAS RN, KATC COG, and KATC EHT acceptance-letter profiles as "
        "InstitutionDocumentProfile tenant rows (idempotent, payload-validated)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate every profile payload via validate_profile_payload "
            "without touching the database.",
        )

    def handle(self, *args, **options):
        # Imported lazily so --dry-run validation works even where the
        # managed=False table is absent (e.g. a plain sqlite test DB).
        from apps.catalog.services import (
            TemplateValidationError,
            validate_profile_payload,
        )

        dry_run = bool(options.get("dry_run"))

        # 1. Validate every payload first (R8.6/8.10) — provably safe before any
        #    persistence side effect.
        for spec in PROFILE_SPECS:
            try:
                validate_profile_payload(
                    sections=spec["sections"],
                    fee_chart=spec["fee_chart"],
                    bank_accounts=spec["bank_accounts"],
                    requirements=spec["requirements"],
                )
            except TemplateValidationError as exc:
                self.stderr.write(
                    self.style.ERROR(f"[{spec['key']}] payload rejected: {exc}")
                )
                raise
            self.stdout.write(f"  [{spec['key']}] payload validated OK")

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Dry run: {len(PROFILE_SPECS)} acceptance profiles validated, "
                    "no rows written."
                )
            )
            return

        from apps.catalog.models import (
            CanonicalProgram,
            Institution,
            InstitutionDocumentProfile,
            Program,
        )

        now = timezone.now()
        created_count = 0
        updated_count = 0

        with transaction.atomic():
            for spec in PROFILE_SPECS:
                institution = self._resolve_institution(Institution, spec, now)
                program = self._resolve_offering(Program, institution, spec)
                canonical = (
                    program.canonical_program if program is not None else None
                )

                lookup = dict(
                    institution=institution,
                    document_type=DOCUMENT_TYPE,
                    program=program,
                    canonical_program=canonical,
                    intake=None,
                    version=PROFILE_VERSION,
                )
                defaults = dict(
                    layout_key=spec["layout_key"],
                    sections=spec["sections"],
                    fee_chart=spec["fee_chart"],
                    bank_accounts=spec["bank_accounts"],
                    requirements=spec["requirements"],
                    signatory=dict(_DEFAULT_SIGNATORY),
                    rules=spec.get("rules"),
                    is_active=True,
                    updated_at=now,
                )

                obj, created = InstitutionDocumentProfile.objects.update_or_create(
                    defaults=defaults,
                    **lookup,
                )
                # Set created_at only on first insert without clobbering history.
                if created and obj.created_at is None:
                    obj.created_at = now
                    obj.save(update_fields=["created_at"])

                scope = (
                    f"offering={program.code}"
                    if program is not None
                    else "institution-default"
                )
                if created:
                    created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  [{spec['key']}] created profile "
                            f"({institution.code}/{DOCUMENT_TYPE}, {scope})"
                        )
                    )
                else:
                    updated_count += 1
                    self.stdout.write(
                        f"  [{spec['key']}] refreshed profile "
                        f"({institution.code}/{DOCUMENT_TYPE}, {scope})"
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n✅ Tenant document profiles seeded: "
                f"{created_count} created, {updated_count} refreshed."
            )
        )

    # ------------------------------------------------------------------ #
    def _resolve_institution(self, Institution, spec, now):
        """Resolve the tenant institution by code, creating it if absent.

        Mirrors the get_or_create idiom in seed_dev_data.py / seed_tenant_dev_data.py.
        """
        institution, created = Institution.objects.get_or_create(
            code=spec["institution_code"],
            defaults=dict(
                **spec["institution_defaults"],
                is_active=True,
                created_at=now,
                updated_at=now,
            ),
        )
        if created:
            self.stdout.write(
                f"    institution created: {institution.code} "
                f"({institution.name})"
            )
        return institution

    def _resolve_offering(self, Program, institution, spec):
        """Resolve the offering Program by name substring within the institution.

        Returns ``None`` when no matching offering exists yet — the profile is
        then created at institution-default scope. Mirrors the
        name-substring matching used by the frontend resolveAcceptanceProfile.
        """
        needle = spec.get("program_name_contains")
        if not needle:
            return None
        return (
            Program.objects.filter(
                institution=institution,
                name__icontains=needle,
            )
            .order_by("created_at", "id")
            .first()
        )
