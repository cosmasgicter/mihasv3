"""Catalog models — maps to existing Neon Postgres tables."""

import uuid

from django.db import models


class Institution(models.Model):
    """Maps to 'institutions' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=500)
    type = models.CharField(max_length=100)
    accreditation_status = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
    institution = models.ForeignKey(Institution, on_delete=models.CASCADE)
    description = models.TextField(blank=True, default="")
    duration_months = models.IntegerField()
    application_fee = models.DecimalField(max_digits=10, decimal_places=2)
    tuition_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    requirements = models.JSONField(default=dict)
    regulatory_body = models.CharField(max_length=100, blank=True, default="")
    accreditation_status = models.CharField(max_length=50, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'programs'

    def __str__(self):
        return f"{self.name} ({self.code})"


class Intake(models.Model):
    """Maps to 'intakes' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    year = models.IntegerField()
    application_deadline = models.DateTimeField()
    max_capacity = models.IntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

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
    max_capacity = models.IntegerField()
    current_enrollment = models.IntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'program_intakes'

    def __str__(self):
        return f"{self.program_id} × {self.intake_id}"


class Subject(models.Model):
    """Maps to 'subjects' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=100)
    is_core = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'subjects'

    def __str__(self):
        return f"{self.name} ({self.code})"


class CourseRequirement(models.Model):
    """Maps to 'course_requirements' table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    minimum_grade = models.IntegerField()  # 1-9 ECZ scale

    class Meta:
        managed = False
        db_table = 'course_requirements'

    def __str__(self):
        return f"{self.program_id} requires {self.subject_id} ≤ grade {self.minimum_grade}"
