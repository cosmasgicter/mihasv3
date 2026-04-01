"""Catalog models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Institution(models.Model):
    """Maps to 'institutions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    type = models.CharField(max_length=100, null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    phone = models.CharField(max_length=20, null=True, blank=True)
    email = models.CharField(max_length=255, null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    accreditation_status = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    full_name = models.CharField(max_length=500, null=True, blank=True)
    description = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'institutions'

    def __str__(self):
        return f"{self.name} ({self.code})"


class Program(models.Model):
    """Maps to 'programs' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(null=True, blank=True)
    duration_months = models.IntegerField(null=True, blank=True)
    application_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tuition_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requirements = models.JSONField(null=True, blank=True)
    regulatory_body = models.CharField(max_length=100, null=True, blank=True)
    accreditation_status = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'programs'

    def __str__(self):
        return f"{self.name} ({self.code})"


class Intake(models.Model):
    """Maps to 'intakes' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    year = models.IntegerField(null=True, blank=True)
    semester = models.CharField(max_length=50, null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    application_start_date = models.DateField(null=True, blank=True)
    application_deadline = models.DateField(null=True, blank=True)
    max_capacity = models.IntegerField(null=True, blank=True)
    current_enrollment = models.IntegerField(null=True, blank=True, default=0)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'intakes'

    def __str__(self):
        return f"{self.name} ({self.year})"


class ProgramIntake(models.Model):
    """Maps to 'program_intakes' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    intake = models.ForeignKey(Intake, on_delete=models.CASCADE)
    max_capacity = models.IntegerField(null=True, blank=True)
    current_enrollment = models.IntegerField(null=True, blank=True, default=0)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'program_intakes'

    def __str__(self):
        return f"{self.program_id} × {self.intake_id}"


class Subject(models.Model):
    """Maps to 'subjects' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, null=True, blank=True, unique=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    is_core = models.BooleanField(null=True, blank=True, default=False)
    is_active = models.BooleanField(null=True, blank=True, default=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'subjects'

    def __str__(self):
        return f"{self.name} ({self.code})"


class CourseRequirement(models.Model):
    """Maps to 'course_requirements' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, null=True, blank=True)
    is_mandatory = models.BooleanField(null=True, blank=True)
    minimum_grade = models.IntegerField()  # 1-9 ECZ scale
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requirement_type = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'course_requirements'

    def __str__(self):
        return f"{self.program_id} requires {self.subject_id} ≤ grade {self.minimum_grade}"
