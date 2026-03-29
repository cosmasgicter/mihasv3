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
    email = models.EmailField(unique=True)
    password_hash = models.TextField()
    first_name = models.CharField(max_length=255)
    last_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, blank=True)
    nationality = models.CharField(max_length=100, default='Zambian')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'profiles'

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"


class DeviceSession(models.Model):
    """Maps to 'device_sessions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE)
    device_info = models.JSONField()
    ip_hash = models.CharField(max_length=64)
    refresh_token_hash = models.CharField(max_length=64)
    last_active = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

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
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'csrf_tokens'

    def __str__(self):
        return f"CSRFToken {self.id} for {self.user_id}"


class UserPermissionOverride(models.Model):
    """Maps to 'user_permission_overrides' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(Profile, on_delete=models.CASCADE)
    permissions = models.JSONField()

    class Meta:
        managed = False
        db_table = 'user_permission_overrides'

    def __str__(self):
        return f"PermOverride {self.id} for {self.user_id}"
