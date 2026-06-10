"""Idempotent multi-tenant (Beanola) dev seed — run AFTER seed_dev_data.py.
Run via: python manage.py shell < scripts/seed_tenant_dev_data.py
"""
import uuid
from decimal import Decimal
from django.utils import timezone

from apps.catalog.models import (
    Institution, Program, Intake, ProgramIntake,
    CanonicalProgram, InstitutionDomain, UserInstitutionMembership,
    InstitutionRequiredDocument,
)
from apps.accounts.models import Profile

now = timezone.now()

# --- 1. Brand/tenant fields on the institution ---
inst = Institution.objects.get(code="MIHAS")
inst.slug = inst.slug or "mihas"
inst.brand_name = inst.brand_name or "MIHAS"
inst.primary_color = inst.primary_color or "#0F766E"
inst.secondary_color = getattr(inst, "secondary_color", None) or "#334155"
inst.support_email = inst.support_email or "support@mihas.edu.zm"
inst.admissions_email = inst.admissions_email or "admissions@mihas.edu.zm"
inst.save()
print(f"Institution branded: {inst.brand_name} (slug={inst.slug})")

# --- 2. Canonical programs (one per offering, linked by code) ---
offerings = list(Program.objects.filter(institution=inst))
for offering in offerings:
    canon, _ = CanonicalProgram.objects.get_or_create(
        code=offering.code,
        defaults=dict(
            name=offering.name,
            description=f"Canonical: {offering.name}",
            duration_months=offering.duration_months,
            regulatory_body=offering.regulatory_body,
            is_active=True,
            created_at=now,
            updated_at=now,
        ),
    )
    # Link the offering to its canonical program + assignment fields.
    offering.canonical_program = canon
    offering.assignment_priority = offering.assignment_priority or 100
    offering.offering_status = offering.offering_status or "active"
    offering.save()
    print(f"  Canonical {canon.code} <- offering {offering.code} ({offering.id})")

# --- 3. Program-intake assignment fields (active + priority + capacity) ---
pi_count = 0
for pi in ProgramIntake.objects.filter(program__institution=inst):
    changed = False
    if getattr(pi, "is_active", None) is None:
        pi.is_active = True; changed = True
    if getattr(pi, "assignment_priority", None) is None:
        pi.assignment_priority = 100; changed = True
    if not pi.max_capacity:
        pi.max_capacity = 50; changed = True
    if changed:
        pi.save(); pi_count += 1
print(f"  ProgramIntake rows updated: {pi_count}")

# --- 4. White-label domain (local hostname → MIHAS) ---
dom, _ = InstitutionDomain.objects.get_or_create(
    hostname="mihas.localhost",
    defaults=dict(institution=inst, is_primary=True, is_active=True,
                  verified_at=now, created_at=now),
)
print(f"  White-label domain: {dom.hostname} -> {inst.code}")

# --- 5. Staff membership (admin user scoped to MIHAS) ---
admin = Profile.objects.filter(email="admin@mihas.edu.zm").first()
if admin:
    mem, _ = UserInstitutionMembership.objects.get_or_create(
        user=admin, institution=inst,
        defaults=dict(role="admin", is_active=True, created_at=now),
    )
    print(f"  Membership: {admin.email} -> {inst.code} (admin)")

# --- 6. A default required document (NRC) for the institution ---
try:
    rd, _ = InstitutionRequiredDocument.objects.get_or_create(
        institution=inst,
        document_type="nrc",
        program=None,
        canonical_program=None,
        defaults=dict(label="National Registration Card", is_required=True,
                      is_active=True, rules={}, created_at=now),
    )
    print(f"  Required document: {rd.label}")
except Exception as e:
    print(f"  Required document skipped: {e}")

print("\n✅ Tenant dev seed complete.")
