"""harness_seed_tenants — seed two same-shaped example tenants for the V2 harness.

Creates two isolated tenants that share ONE canonical program (the realistic
"same program name across two schools" case that TEN-07 and the two-tenant
isolation journeys need), each with an ACTIVE white-label domain so host-based
tenant resolution (``InstitutionContextService.resolve``) works locally:

    mihas.localhost  -> tenant A (MIHAS)
    katc.localhost   -> tenant B (KATC)

Both are example ``Institution`` tenants of the Beanola platform — never the
platform identity itself.

Phase-0 interim note
--------------------
The *target* is for the harness to create these tenants purely through the
admin onboarding API (design section 16 / R4.7). Today that API path and the
domain verify→activate lifecycle are incomplete (findings TEN-01, TEN-02,
TEN-03, TEN-04) and are rebuilt in Phase 4. Until then this command seeds the
two-tenant baseline deterministically via canonical models so the harness is
runnable now. The TypeScript API helpers additionally exercise API-driven
institution + domain creation to prove that path as far as it currently works.
Each offering also gets one local application fee in ``program_fees`` (the canonical
fee authority), so a fresh database has an offering a student can pay for.

This command is idempotent and never runs in production.
"""

from __future__ import annotations

import os
from decimal import Decimal
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

CANONICAL_PROGRAM = {
    "name": "Diploma in Registered Nursing",
    "code": "CANON-DRN",
    "description": "Canonical program definition shared across schools.",
    "duration_months": 36,
    "regulatory_body": "NMCZ",
}

TENANTS = [
    {
        "code": "MIHAS",
        "slug": "mihas",
        "name": "MIHAS",
        "full_name": "Mikango Institute of Health & Allied Sciences",
        "hostname": "mihas.localhost",
        "brand_name": "MIHAS",
        "primary_color": "#0F766E",
    },
    {
        "code": "KATC",
        "slug": "katc",
        "name": "KATC",
        "full_name": "Kabwe Allied Training College",
        "hostname": "katc.localhost",
        "brand_name": "KATC",
        "primary_color": "#1D4ED8",
    },
]


class Command(BaseCommand):
    help = "Seed two same-shaped example tenants (MIHAS + KATC) with active domains for the harness."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant-admin-password",
            default=os.environ.get("HARNESS_TENANT_ADMIN_PASSWORD"),
            help="Plaintext password for the seeded tenant admins (or set "
            "HARNESS_TENANT_ADMIN_PASSWORD). bcrypt-hashed before storage.",
        )

    def handle(self, *args, **opts):
        if (
            os.environ.get("DJANGO_SETTINGS_MODULE", "").endswith(".prod")
            or os.environ.get("ENVIRONMENT", "").lower() == "production"
        ):
            raise CommandError(
                "harness_seed_tenants refuses to run under production settings."
            )
        db_url = os.environ.get("DATABASE_URL", "")
        for danger in ("neon.tech", "amazonaws.com", "rds.", "beanola.com"):
            if danger in db_url:
                raise CommandError(
                    f"harness_seed_tenants refuses to run: DATABASE_URL points at a "
                    f"non-local host ({danger!r})."
                )

        password = opts.get("tenant_admin_password")
        if not password:
            raise CommandError(
                "A tenant-admin password is required: pass --tenant-admin-password "
                "or set HARNESS_TENANT_ADMIN_PASSWORD."
            )

        from apps.accounts.models import Profile
        from apps.accounts.services import hash_password
        from apps.documents.models import ProgramFee
        from apps.catalog.models import (
            CanonicalProgram,
            Institution,
            InstitutionDomain,
            Intake,
            Program,
            ProgramIntake,
            UserInstitutionMembership,
        )

        now = timezone.now()

        with transaction.atomic():
            canonical, _ = CanonicalProgram.objects.get_or_create(
                code=CANONICAL_PROGRAM["code"],
                defaults={
                    "name": CANONICAL_PROGRAM["name"],
                    "description": CANONICAL_PROGRAM["description"],
                    "duration_months": CANONICAL_PROGRAM["duration_months"],
                    "regulatory_body": CANONICAL_PROGRAM["regulatory_body"],
                    "is_active": True,
                    "metadata": {},
                    "created_at": now,
                    "updated_at": now,
                },
            )

            for spec in TENANTS:
                institution, _ = Institution.objects.get_or_create(
                    code=spec["code"],
                    defaults={
                        "name": spec["name"],
                        "full_name": spec["full_name"],
                        "slug": spec["slug"],
                        "brand_name": spec["brand_name"],
                        "primary_color": spec["primary_color"],
                        "secondary_color": "#334155",
                        "support_email": f"support@{spec['slug']}.localhost",
                        "admissions_email": f"admissions@{spec['slug']}.localhost",
                        "is_active": True,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

                # Active white-label domain so host resolution binds the tenant.
                InstitutionDomain.objects.get_or_create(
                    hostname=spec["hostname"],
                    defaults={
                        "institution": institution,
                        "is_primary": True,
                        "is_active": True,
                        "status": "active",
                        "verified_at": now,
                        "last_checked_at": now,
                        "created_at": now,
                    },
                )

                offering, _ = Program.objects.get_or_create(
                    institution=institution,
                    code=f"{spec['code']}-DRN",
                    defaults={
                        "name": f"{spec['name']} — Diploma in Registered Nursing",
                        "description": "School offering of the canonical program.",
                        "canonical_program": canonical,
                        "duration_months": 36,
                        "application_fee": Decimal("153.00"),
                        "requirements": {},
                        "is_active": True,
                        "offering_status": "active",
                        "assignment_priority": 100,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

                # The canonical fee authority is ``program_fees`` (FeeResolver), not
                # ``programs.application_fee``. ``get_or_create`` matches any row an
                # API-configured harness already added, so this never duplicates it.
                ProgramFee.objects.get_or_create(
                    program=offering,
                    fee_type="application",
                    residency_category="local",
                    defaults={
                        "amount": Decimal("153.00"),
                        "currency": "ZMW",
                        "is_active": True,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

                intake, _ = Intake.objects.get_or_create(
                    name=f"{spec['code']} January 2027",
                    defaults={
                        "year": now.year + 1,
                        "max_capacity": 100,
                        "current_enrollment": 0,
                        "application_deadline": (now + timedelta(days=120)).date(),
                        "is_active": True,
                        "created_at": now,
                        "updated_at": now,
                    },
                )

                ProgramIntake.objects.get_or_create(
                    program=offering,
                    intake=intake,
                    defaults={
                        "max_capacity": 100,
                        "current_enrollment": 0,
                        "is_active": True,
                        "created_at": now,
                    },
                )

                admin_email = f"admin@{spec['slug']}.localhost"
                admin = Profile.objects.filter(email__iexact=admin_email).first()
                if admin is None:
                    admin = Profile(email=admin_email, created_at=now)
                admin.role = "admin"
                admin.is_active = True
                admin.email_verified = True
                admin.first_name = spec["code"]
                admin.last_name = "Administrator"
                admin.full_name = f"{spec['code']} Administrator"
                admin.password_hash = hash_password(password)
                admin.password_changed_at = now
                admin.updated_at = now
                admin.save()

                UserInstitutionMembership.objects.get_or_create(
                    user=admin,
                    institution=institution,
                    role="admin",
                    defaults={"permissions": [], "is_active": True, "created_at": now},
                )

                # R7-a: a separate staff account that can decide (``review``), added
                # through the same additive rule as ``seed_school_admins``. The
                # ``admin@`` accounts above stay read-only on purpose: harness
                # isolation specs rely on them.
                decider_email = f"decider@{spec['slug']}.localhost"
                decider = Profile.objects.filter(email__iexact=decider_email).first()
                if decider is None:
                    decider = Profile(email=decider_email, created_at=now)
                decider.role = "admin"
                decider.is_active = True
                decider.email_verified = True
                decider.first_name = spec["code"]
                decider.last_name = "Decider"
                decider.full_name = f"{spec['code']} Decider"
                decider.password_hash = hash_password(password)
                decider.password_changed_at = now
                decider.updated_at = now
                decider.save()
                outcome = seed_membership(
                    user=decider,
                    institution=institution,
                    role="admin",
                    requested=["review"],
                    mode="add",
                    source="harness_seed_tenants",
                    run_id=run_id,
                    now=now,
                )
                seeded_changes += 1 if outcome.changed else 0
                self.stdout.write(
                    self.style.SUCCESS(
                        f"seeded tenant {spec['code']} -> {spec['hostname']} "
                        f"(admin: {admin_email})"
                    )
                )

            assert_audit_rows_recorded(run_id, seeded_changes)
        self.stdout.write(self.style.SUCCESS("harness_seed_tenants complete (2 tenants, 1 shared canonical program)"))
