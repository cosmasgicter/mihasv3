"""
Idempotent dev data seed script.
Run via: python manage.py shell < scripts/seed_dev_data.py
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.accounts.models import Profile
from apps.accounts.services import hash_password
from apps.catalog.models import Institution, Program, Intake, ProgramIntake
from apps.documents.models import ProgramFee

now = timezone.now()

# --- 1. Institution ---
inst, _ = Institution.objects.get_or_create(
    code='MIHAS',
    defaults=dict(
        name='Mukuba Institute of Health and Applied Sciences',
        full_name='Mukuba Institute of Health and Applied Sciences',
        type='Private College',
        email='info@mihas.edu.zm',
        website='https://mihas.edu.zm',
        accreditation_status='accredited',
        is_active=True,
        created_at=now,
        updated_at=now,
    ),
)
print(f"Institution: {inst.name} ({inst.code})")

# --- 2. Programs ---
PROGRAMS = [
    ('DCM', 'Diploma in Clinical Medicine', 36, 'Health Professions Council of Zambia'),
    ('DEH', 'Diploma in Environmental Health', 36, 'Health Professions Council of Zambia'),
    ('DRN', 'Diploma in Registered Nursing', 36, 'Nursing Council of Zambia'),
]

programs = []
for code, name, duration, reg_body in PROGRAMS:
    prog, _ = Program.objects.get_or_create(
        code=code,
        defaults=dict(
            name=name,
            duration_months=duration,
            regulatory_body=reg_body,
            accreditation_status='accredited',
            is_active=True,
            institution=inst,
            created_at=now,
            updated_at=now,
        ),
    )
    programs.append(prog)
    print(f"  Program: {prog.name} ({prog.code})")

# --- 3. Intakes (Jan 2026 + Jul 2026) ---
INTAKE_SPECS = [
    (1, 2026, 'January 2026'),
    (7, 2026, 'July 2026'),
    (1, 2027, 'January 2027'),
]

intakes = []
for month, year, name in INTAKE_SPECS:
    start = date(year, month, 1)
    # application window: 11 months before start → 2 months after start
    app_start_month = month - 11
    app_start_year = year
    if app_start_month <= 0:
        app_start_month += 12
        app_start_year -= 1
    deadline_month = month + 2
    deadline_year = year
    if deadline_month > 12:
        deadline_month -= 12
        deadline_year += 1

    intake, _ = Intake.objects.get_or_create(
        name=name,
        year=year,
        defaults=dict(
            start_date=start,
            application_start_date=date(app_start_year, app_start_month, 1),
            application_deadline=date(deadline_year, deadline_month, 1),
            max_capacity=50,
            current_enrollment=0,
            is_active=True,
            grace_period_days=14,
            created_at=now,
            updated_at=now,
        ),
    )
    intakes.append(intake)
    print(f"  Intake: {intake.name} (active={intake.is_active})")

# --- 3b. Link programs to intakes ---
for prog in programs:
    for intake in intakes:
        ProgramIntake.objects.get_or_create(
            program=prog,
            intake=intake,
            defaults=dict(max_capacity=50, current_enrollment=0, created_at=now),
        )

print(f"  ProgramIntake links: {len(programs) * len(intakes)}")

# --- 4. Test users ---
USERS = [
    ('student@mihas.edu.zm', 'Student!2026', 'student', 'Test', 'Student'),
    ('***REMOVED***', 'Admin!2026', 'admin', 'Test', 'Admin'),
    ('super***REMOVED***', 'SuperAdmin!2026', 'super_admin', 'Test', 'SuperAdmin'),
]

for email, password, role, first, last in USERS:
    user, created = Profile.objects.get_or_create(
        email=email,
        defaults=dict(
            role=role,
            first_name=first,
            last_name=last,
            full_name=f"{first} {last}",
            password_hash=hash_password(password),
            is_active=True,
            email_verified=True,
            nationality='Zambian',
            created_at=now,
            updated_at=now,
        ),
    )
    action = "created" if created else "exists"
    print(f"  User: {email} ({role}) — {action}")

# --- 5. Program fees ---
FEE_DATA = [
    # (residency, amount_zmw)
    ('local', Decimal('500.00')),
    ('international', Decimal('150.00')),  # USD equivalent stored as 150 USD
]

fee_count = 0
for prog in programs:
    for residency, amount in FEE_DATA:
        currency = 'ZMW' if residency == 'local' else 'USD'
        _, created = ProgramFee.objects.get_or_create(
            program=prog,
            fee_type='application',
            residency_category=residency,
            defaults=dict(
                amount=amount,
                currency=currency,
                is_active=True,
                created_at=now,
                updated_at=now,
            ),
        )
        if created:
            fee_count += 1

print(f"  Program fees created: {fee_count}")
print("\n✅ Dev seed complete.")
