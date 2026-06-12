"""Brand existing institutions so official documents render styled, not bare.

Run: python manage.py brand_institutions
     python manage.py brand_institutions --dry-run

The backend reportlab renderer (``apps/applications/tasks/pdf/layouts``) is
tenant-aware: it draws the institution's ``primary_color`` letterhead band,
``brand_name`` heading, and the admissions contact line from
``_tenant_context`` (``apps/applications/tasks/pdf_generation.py``). When those
columns are blank the renderer falls back to a bare default (teal + Helvetica,
no contact line), which is why production slips looked unstyled.

This command seeds branding metadata for the known MIHAS/KATC tenants (and is
the template for branding any future school). It is **idempotent and
non-destructive**: a column is only filled when it is currently NULL/blank, so
re-running never clobbers values an operator set in the Tenant Onboarding UI.

Brand note: MIHAS/KATC are legitimate tenant fixtures here (allowlisted seed
data), confined to this seed command.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

# Per-institution branding defaults. Colours are accessible (WCAG AA on white)
# and distinct per school so documents are visually attributable at a glance.
BRANDING_SPECS: dict[str, dict[str, Any]] = {
    "MIHAS": {
        "brand_name": "Mukuba Institute of Health and Applied Sciences",
        "full_name": "Mukuba Institute of Health and Applied Sciences",
        "primary_color": "#0F766E",  # teal-700
        "secondary_color": "#334155",  # slate-700
        "admissions_email": "admissions@mihas.beanola.com",
        "support_email": "support@mihas.beanola.com",
        "website": "https://mihas.beanola.com",
        "type": "Private College",
    },
    "KATC": {
        "brand_name": "Kalulushi Training Centre",
        "full_name": "Kalulushi Training Centre",
        "primary_color": "#1D4ED8",  # blue-700
        "secondary_color": "#334155",  # slate-700
        "admissions_email": "admissions@katc.beanola.com",
        "support_email": "support@katc.beanola.com",
        "website": "https://katc.beanola.com",
        "type": "Private College",
    },
}

# Columns this command may seed. ``brand_name``/colours/contacts only — never
# identity columns (code, slug) or lifecycle flags.
_BRANDABLE_FIELDS = (
    "brand_name",
    "full_name",
    "primary_color",
    "secondary_color",
    "admissions_email",
    "support_email",
    "website",
    "type",
)


def _is_blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


class Command(BaseCommand):
    help = (
        "Seed branding metadata (brand_name, colours, admissions contact, "
        "website) for existing institutions so official documents render "
        "styled. Idempotent: only fills blank columns."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing non-blank values too (default only fills blanks).",
        )

    def handle(self, *args, **options):
        from apps.catalog.models import Institution

        dry_run = bool(options.get("dry_run"))
        force = bool(options.get("force"))
        now = timezone.now()

        updated = 0
        skipped = 0

        with transaction.atomic():
            for code, spec in BRANDING_SPECS.items():
                institution = Institution.objects.filter(code__iexact=code).first()
                if institution is None:
                    self.stdout.write(
                        self.style.WARNING(f"  [{code}] not found — skipping")
                    )
                    skipped += 1
                    continue

                changed_fields: list[str] = []
                for field in _BRANDABLE_FIELDS:
                    desired = spec.get(field)
                    if desired is None:
                        continue
                    current = getattr(institution, field, None)
                    if force or _is_blank(current):
                        if current != desired:
                            setattr(institution, field, desired)
                            changed_fields.append(field)

                if not changed_fields:
                    self.stdout.write(f"  [{code}] already branded — no change")
                    skipped += 1
                    continue

                institution.updated_at = now
                if not dry_run:
                    institution.save(update_fields=[*changed_fields, "updated_at"])
                updated += 1
                verb = "would update" if dry_run else "updated"
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  [{code}] {verb}: {', '.join(changed_fields)}"
                    )
                )

            if dry_run:
                transaction.set_rollback(True)

        summary = (
            f"Dry run: {updated} institution(s) would be branded, {skipped} unchanged."
            if dry_run
            else f"✅ Branding seeded: {updated} updated, {skipped} unchanged."
        )
        self.stdout.write(self.style.SUCCESS(f"\n{summary}"))
