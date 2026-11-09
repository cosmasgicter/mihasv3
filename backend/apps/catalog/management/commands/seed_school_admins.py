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

Idempotent and additive (R7-a, DEC-11): re-running updates the existing admin
Profile (role/active/verified + password) and ensures exactly one active
``admin`` membership per school that holds ``review`` (``--permissions``,
default ``review``). Permissions the membership already holds, such as grants an
operator added in the admin UI, are kept and nothing is removed. Use
``--replace`` to make the membership hold exactly the ``--permissions`` list, or
``--read-only`` to grant none. ``AccessGrant`` rows are never touched. Each
membership the run creates, reactivates or changes emits one
``tenant.membership.permissions_seeded`` audit event (ids and permission names
only); a membership the run does not change is not written and gets no event.
All writes of one run happen in one transaction that rolls back if an audit row
is missing. Passwords are hashed with the platform's own ``hash_password`` (bcrypt, 12
rounds) — never stored in plaintext.
"""

from __future__ import annotations

import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile
from apps.accounts.services import hash_password
from apps.catalog.models import Institution, UserInstitutionMembership

from ._seed_memberships import (
    assert_audit_rows_recorded,
    new_run_id,
    resolve_permission_options,
    seed_membership,
)


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
            "--permissions",
            default=None,
            help="Comma list of membership permissions to add (default: review). "
            "Allowed: view, review, manage, verify_documents, verify_payments, export.",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Make the membership hold exactly --permissions (removes others).",
        )
        parser.add_argument(
            "--read-only",
            dest="read_only",
            action="store_true",
            help="Grant no permissions (read-only bundle); removes existing ones.",
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
        requested, mode = resolve_permission_options(
            permissions=opts.get("permissions"),
            replace=opts.get("replace", False),
            read_only=opts.get("read_only", False),
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

        run_id = new_run_id()
        changed = 0
        with transaction.atomic():
            for inst, email in targets:
                prof = Profile.objects.filter(email__iexact=email).first()
                action = "UPDATE" if prof else "CREATE"
                if dry:
                    outcome = seed_membership(
                        user=prof,
                        institution=inst,
                        role="admin",
                        requested=requested,
                        mode=mode,
                        source="seed_school_admins",
                        run_id=run_id,
                        now=now,
                        dry_run=True,
                    )
                    self.stdout.write(
                        f"[dry-run] {action} admin {email} -> {inst.code}; {outcome.describe()}"
                    )
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
                outcome = seed_membership(
                    user=prof,
                    institution=inst,
                    role="admin",
                    requested=requested,
                    mode=mode,
                    source="seed_school_admins",
                    run_id=run_id,
                    now=now,
                )
                changed += 1 if outcome.changed else 0
                self.stdout.write(
                    self.style.SUCCESS(f"{action} {email} -> {inst.code} (admin); {outcome.describe()}")
                )
            if not dry:
                assert_audit_rows_recorded(run_id, changed)
        active = UserInstitutionMembership.objects.filter(is_active=True).count()
        self.stdout.write(f"Active institution memberships: {active}")
