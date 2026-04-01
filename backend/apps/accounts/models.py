"""Account models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


ROLE_CHOICES = [
    ('student', 'Student'),
    ('admin', 'Admin'),
    ('reviewer', 'Reviewer'),
    ('super_admin', 'Super Admin'),
]


class Profile(models.Model):
    """Maps to 'profiles' table. Primary user model."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=255, unique=True)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, null=True, blank=True)
    first_name = models.CharField(max_length=255, null=True, blank=True)
    last_name = models.CharField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    password_hash = models.TextField(null=True, blank=True)
    refresh_token_hash = models.TextField(null=True, blank=True)
    failed_login_attempts = models.IntegerField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    email_verified = models.BooleanField(null=True, blank=True)
    avatar_url = models.TextField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    nrc_number = models.CharField(max_length=20, null=True, blank=True)
    nationality = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    sex = models.CharField(max_length=10, null=True, blank=True)
    residence_town = models.CharField(max_length=255, null=True, blank=True)
    next_of_kin_name = models.CharField(max_length=255, null=True, blank=True)
    next_of_kin_phone = models.CharField(max_length=50, null=True, blank=True)
    full_name = models.CharField(max_length=255, null=True, blank=True)
    country = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'profiles'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"


class DeviceSession(models.Model):
    """Maps to 'device_sessions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE)
    device_id = models.TextField(default="")
    device_info = models.TextField(null=True, blank=True)
    session_token = models.TextField(default="")
    ip_address = models.CharField(max_length=45, null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    last_activity = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'device_sessions'

    def __str__(self):
        return f"Session {self.id} for {self.user_id}"


class LoginAttempt(models.Model):
    """Maps to 'login_attempts' table. No PII — email/IP stored as SHA-256 hashes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email_hash = models.CharField(max_length=64)
    ip_hash = models.CharField(max_length=64)
    success = models.BooleanField()
    attempted_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'login_attempts'

    def __str__(self):
        return f"LoginAttempt {self.id} success={self.success}"


class PasswordResetToken(models.Model):
    """Maps to 'password_reset_tokens' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE)
    token_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'password_reset_tokens'

    def __str__(self):
        return f"ResetToken {self.id} for {self.user_id}"


class CSRFToken(models.Model):
    """Maps to 'csrf_tokens' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE)
    token_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'csrf_tokens'

    def __str__(self):
        return f"CSRFToken {self.id} for {self.user_id}"


class UserPermissionOverride(models.Model):
    """Maps to 'user_permission_overrides' table. PK is user_id (no id column)."""

    user = models.OneToOneField(Profile, on_delete=models.CASCADE, primary_key=True)
    permissions = models.JSONField()  # DB stores as text[] but Django reads via JSONField
    updated_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'user_permission_overrides'

    def __str__(self):
        return f"PermOverride for {self.user_id}"
