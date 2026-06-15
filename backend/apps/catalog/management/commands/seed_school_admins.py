"""Seed (idempotently) one institution-admin Profile per active school and bind
it via an active ``user_institution_memberships`` row.

This exists so per-school staff readiness (R12.7 of the
``beanola-production-readiness`` spec) can be satisfied reproducibly across
environments. It does **not** hardcode any credential — the password is supplied
via ``--password`` or the ``SCHOOL_ADMIN_PASSWORD`` environment variable, and the
email is derived per institution (``--email-template``, default
``admin@{slug_or_code}.edu.zm``) or overridden with explicit ``--admin`` pairs.

Usage (run inside the backend container / venv):

    python manage.py seed_school_admins --password '<password>'
    python manage.py seed_school_admins --admin <CODE>=admin@<school-domain> \
        --admin <CODE2>=admin@<school-domain2> --password "$SCHOOL_ADMIN_PASSWORD"
    python manage.py seed_school_admins --password '<pw>' --dry-run

Idempotent: re-running updates the existing admin Profile (role/active/verified
+ password) and ensures exactly one active ``admin`` membership per school.
Passwords are hashed with the platform's own ``hash_password`` (bcrypt, 12
rounds) — never stored in plaintext.
"""

from __future__ import annotations

import os

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import Profile
from apps.accounts.services import hash_password
from apps.catalog.models import Institution, UserInstitutionMembership


class Command(BaseCommand):
    help = "Idempotently seed an institution-admin user + membership per active school."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=os.environ.get("SCHOOL_ADMIN_PASSWORD"),
            help="Plaintext password for the seeded admins (or set SCHOOL_ADMIN_PASSWORD). "
            "Hashed with bcrypt before storage; never persisted in plaintext.",
        )
        parser.add_argument(
            "--admin",
            action="append",
            default=[],
            metavar="CODE=email",
            help="Explicit CODE=email pair (repeatable). If omitted, an admin is "
            "seeded for every active institution using --email-template.",
        )
        parser.add_argument(
            "--email-template",
            default="admin@{key}.edu.zm",
            help="Email template when --admin is not given; {key} = lower(slug or code).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )

    def handle(self, *args, **opts):
        password = opts.get("password")
        if not password:
            raise CommandError(
                "A password is required: pass --password or set SCHOOL_ADMIN_PASSWORD."
            )
        dry = opts["dry_run"]
        now = timezone.now()

        # Build the (institution, email) work list.
        targets = []
        if opts["admin"]:
            for pair in opts["admin"]:
                if "=" not in pair:
                    raise CommandError(f"--admin expects CODE=email, got: {pair!r}")
                code, email = (p.strip() for p in pair.split("=", 1))
                inst = Institution.objects.filter(code__iexact=code).first()
                if inst is None:
                    self.stderr.write(f"SKIP {email}: institution {code!r} not found")
                    continue
                targets.append((inst, email))
        else:
            for inst in Institution.objects.filter(is_active=True).order_by("code"):
                key = (inst.slug or inst.code or "").strip().lower()
                if not key:
                    self.stderr.write(f"SKIP institution {inst.pk}: no slug/code")
                    continue
                targets.append((inst, opts["email_template"].format(key=key)))

        if not targets:
            self.stdout.write("No target institutions; nothing to seed.")
            return

        for inst, email in targets:
            prof = Profile.objects.filter(email__iexact=email).first()
            action = "UPDATE" if prof else "CREATE"
            if dry:
                self.stdout.write(f"[dry-run] {action} admin {email} -> {inst.code}")
                continue
            if prof is None:
                prof = Profile(email=email, created_at=now)
            prof.role = "admin"
            prof.is_active = True
            prof.email_verified = True
            prof.first_name = prof.first_name or (inst.code or "School")
            prof.last_name = prof.last_name or "Administrator"
            prof.full_name = f"{prof.first_name} {prof.last_name}"
            prof.password_hash = hash_password(password)
            prof.password_changed_at = now
            prof.updated_at = now
            prof.save()

            mem = UserInstitutionMembership.objects.filter(
                user=prof, institution=inst, role="admin"
            ).first()
            if mem is None:
                UserInstitutionMembership.objects.create(
                    user=prof,
                    institution=inst,
                    role="admin",
                    is_active=True,
                    created_at=now,
                )
                mem_state = "membership created"
            elif not mem.is_active:
                mem.is_active = True
                mem.save(update_fields=["is_active"])
                mem_state = "membership reactivated"
            else:
                mem_state = "membership present"
            self.stdout.write(
                self.style.SUCCESS(f"{action} {email} -> {inst.code} (admin); {mem_state}")
            )

        active = UserInstitutionMembership.objects.filter(is_active=True).count()
        self.stdout.write(f"Active institution memberships: {active}")
