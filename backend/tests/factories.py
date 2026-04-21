"""factory_boy factories for all 26 MIHAS Django models."""

import hashlib
import uuid
from datetime import timedelta
from decimal import Decimal

import factory
from django.utils import timezone

from apps.accounts.models import (
    CSRFToken,
    DeviceSession,
    LoginAttempt,
    PasswordResetToken,
    Profile,
    UserPermissionOverride,
)
from apps.applications.models import (
    Application,
    ApplicationDraft,
    ApplicationInterview,
    ApplicationStatusHistory,
)
from apps.catalog.models import (
    CourseRequirement,
    Institution,
    Intake,
    Program,
    ProgramIntake,
    Subject,
)
from apps.common.models import (
    AuditLog,
    EmailQueue,
    IdempotencyKey,
    MigrationHistory,
    Notification,
    Setting,
    UserNotificationPreference,
)
from apps.documents.models import ApplicationDocument, ApplicationGrade, Payment


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ---------------------------------------------------------------------------
# accounts app
# ---------------------------------------------------------------------------


class ProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Profile

    id = factory.LazyFunction(uuid.uuid4)
    email = factory.Faker("email")
    password_hash = factory.LazyFunction(
        lambda: "$2b$12$LJ3m4ys3Lk0TBMqVtZZKaeNzSgKJGzOFNrMePszKqRQWbFmcHbz3S"
    )
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    phone = factory.LazyFunction(lambda: f"+260{factory.Faker._get_faker().numerify('#########')}")
    nationality = "Zambian"
    role = "student"
    is_active = True


class DeviceSessionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = DeviceSession

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    device_id = factory.LazyFunction(lambda: str(uuid.uuid4()))
    device_info = factory.LazyFunction(lambda: '{"browser": "Chrome", "os": "Linux"}')
    session_token = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    ip_address = factory.Faker("ipv4")
    user_agent = factory.Faker("user_agent")
    last_activity = factory.LazyFunction(timezone.now)
    is_active = True


class LoginAttemptFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = LoginAttempt

    id = factory.LazyFunction(uuid.uuid4)
    email_hash = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    ip_hash = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    success = True


class PasswordResetTokenFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PasswordResetToken

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    token_hash = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    expires_at = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=1))
    used_at = None


class CSRFTokenFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CSRFToken

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    token_hash = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    expires_at = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=24))


class UserPermissionOverrideFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = UserPermissionOverride

    user = factory.SubFactory(ProfileFactory)
    permissions = factory.LazyFunction(lambda: [])


# ---------------------------------------------------------------------------
# applications app
# ---------------------------------------------------------------------------


class ApplicationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Application

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    application_number = factory.Sequence(lambda n: f"APP-{n:06d}")
    public_tracking_code = factory.Sequence(lambda n: f"TRK-{n:06d}")
    full_name = factory.Faker("name")
    nrc_number = factory.LazyFunction(
        lambda: f"{factory.Faker._get_faker().numerify('######')}/{factory.Faker._get_faker().numerify('##')}/{factory.Faker._get_faker().numerify('#')}"
    )
    passport_number = ""
    date_of_birth = factory.Faker("date_of_birth", minimum_age=16, maximum_age=50)
    sex = factory.Faker("random_element", elements=["Male", "Female"])
    phone = factory.LazyFunction(lambda: f"+260{factory.Faker._get_faker().numerify('#########')}")
    email = factory.Faker("email")
    residence_town = factory.Faker("city")
    nationality = "Zambian"
    program = factory.Faker("bs")
    intake = factory.Faker("random_element", elements=["January 2025", "September 2025"])
    institution = factory.Faker("company")
    status = "draft"
    version = 1


class ApplicationStatusHistoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApplicationStatusHistory

    id = factory.LazyFunction(uuid.uuid4)
    application = factory.SubFactory(ApplicationFactory)
    old_status = "draft"
    new_status = "submitted"
    changed_by = factory.SubFactory(ProfileFactory)
    notes = factory.Faker("sentence")


class ApplicationDraftFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApplicationDraft

    id = factory.LazyFunction(uuid.uuid4)
    application = None
    user = factory.SubFactory(ProfileFactory)
    draft_data = factory.LazyFunction(lambda: {"step": 1, "personal": {"name": "Test"}})


class ApplicationInterviewFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApplicationInterview

    id = factory.LazyFunction(uuid.uuid4)
    application = factory.SubFactory(ApplicationFactory)
    scheduled_at = factory.LazyFunction(lambda: timezone.now() + timedelta(days=7))
    status = "scheduled"
    notes = ""


# ---------------------------------------------------------------------------
# documents app
# ---------------------------------------------------------------------------


class ApplicationDocumentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApplicationDocument

    id = factory.LazyFunction(uuid.uuid4)
    application = factory.SubFactory(ApplicationFactory)
    document_type = factory.Faker(
        "random_element", elements=["nrc", "certificate", "transcript", "passport_photo"]
    )
    document_name = factory.LazyFunction(lambda: f"document_{uuid.uuid4()}.pdf")
    file_url = ""
    verification_status = "pending"
    extracted_text = ""


class ApplicationGradeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ApplicationGrade

    id = factory.LazyFunction(uuid.uuid4)
    application = factory.SubFactory(ApplicationFactory)
    subject = factory.SubFactory("tests.factories.SubjectFactory")
    grade = factory.Faker("random_int", min=1, max=9)


class PaymentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Payment

    id = factory.LazyFunction(uuid.uuid4)
    application = factory.SubFactory(ApplicationFactory)
    user = factory.SubFactory(ProfileFactory)
    amount = factory.LazyFunction(lambda: Decimal("500.00"))
    currency = "ZMW"
    status = "pending"
    verified_by = None
    notes = ""


# ---------------------------------------------------------------------------
# catalog app
# ---------------------------------------------------------------------------


class InstitutionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Institution

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker("company")
    code = factory.Sequence(lambda n: f"INST-{n:04d}")
    full_name = factory.Faker("company")
    type = factory.Faker("random_element", elements=["University", "College", "Institute"])
    accreditation_status = "accredited"
    is_active = True


class ProgramFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Program

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker("bs")
    code = factory.Sequence(lambda n: f"PRG-{n:04d}")
    institution = factory.SubFactory(InstitutionFactory)
    duration_months = factory.Faker("random_int", min=12, max=60)
    application_fee = factory.LazyFunction(lambda: Decimal("250.00"))
    requirements = factory.LazyFunction(lambda: {})
    is_active = True


class IntakeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Intake

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker("random_element", elements=["January Intake", "September Intake"])
    year = factory.Faker("random_int", min=2024, max=2026)
    application_deadline = factory.LazyFunction(lambda: (timezone.now() + timedelta(days=90)).date())
    max_capacity = factory.Faker("random_int", min=50, max=500)
    is_active = True


class ProgramIntakeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ProgramIntake

    id = factory.LazyFunction(uuid.uuid4)
    program = factory.SubFactory(ProgramFactory)
    intake = factory.SubFactory(IntakeFactory)
    max_capacity = factory.Faker("random_int", min=20, max=200)
    current_enrollment = 0


class SubjectFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Subject

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Faker(
        "random_element",
        elements=["Mathematics", "English", "Biology", "Chemistry", "Physics"],
    )
    code = factory.Sequence(lambda n: f"SUB-{n:04d}")
    category = factory.Faker("random_element", elements=["Science", "Arts", "Commercial"])
    is_core = False


class CourseRequirementFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CourseRequirement

    id = factory.LazyFunction(uuid.uuid4)
    program = factory.SubFactory(ProgramFactory)
    subject = factory.SubFactory(SubjectFactory)
    minimum_grade = factory.Faker("random_int", min=1, max=6)


# ---------------------------------------------------------------------------
# common app
# ---------------------------------------------------------------------------


class AuditLogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AuditLog

    id = factory.LazyFunction(uuid.uuid4)
    actor_id = factory.LazyFunction(uuid.uuid4)
    action = factory.Faker(
        "random_element", elements=["create", "update", "delete", "login", "logout"]
    )
    entity_type = factory.Faker(
        "random_element", elements=["application", "profile", "payment", "document"]
    )
    entity_id = factory.LazyFunction(uuid.uuid4)
    changes = factory.LazyFunction(lambda: {})
    ip_address = factory.LazyFunction(lambda: _sha256(str(uuid.uuid4())))
    user_agent = factory.LazyFunction(lambda: _sha256("Mozilla/5.0"))
    retention_category = "standard"


class IdempotencyKeyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IdempotencyKey

    idempotency_key = factory.LazyFunction(lambda: str(uuid.uuid4()))
    actor_id = factory.LazyFunction(uuid.uuid4)
    method = "POST"
    path = factory.Faker(
        "random_element",
        elements=["/api/v1/applications/", "/api/v1/payments/", "/api/v1/notifications/"],
    )
    request_hash = factory.LazyFunction(lambda: _sha256(""))
    status = "completed"
    response_status = 200
    response_body = factory.LazyFunction(lambda: {"success": True, "data": {}})


class SettingFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Setting

    id = factory.LazyFunction(uuid.uuid4)
    key = factory.Sequence(lambda n: f"setting_key_{n}")
    value = factory.LazyFunction(lambda: {"default": True})
    category = factory.Faker("random_element", elements=["general", "email", "security"])
    description = factory.Faker("sentence")
    is_public = False


class NotificationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Notification

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    title = factory.Faker("sentence", nb_words=5)
    message = factory.Faker("paragraph")
    type = factory.Faker("random_element", elements=["info", "warning", "success", "error"])
    is_read = False
    idempotency_key = factory.LazyFunction(lambda: str(uuid.uuid4()))


class UserNotificationPreferenceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = UserNotificationPreference

    id = factory.LazyFunction(uuid.uuid4)
    user = factory.SubFactory(ProfileFactory)
    email_enabled = True
    sms_enabled = False


class EmailQueueFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = EmailQueue

    id = factory.LazyFunction(uuid.uuid4)
    recipient_email = factory.Faker("email")
    subject = factory.Faker("sentence", nb_words=6)
    body = factory.Faker("paragraph")
    status = "pending"
    retry_count = 0
    error_message = ""


class MigrationHistoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MigrationHistory

    migration_name = factory.Sequence(lambda n: f"migration_{n:04d}_add_feature")
