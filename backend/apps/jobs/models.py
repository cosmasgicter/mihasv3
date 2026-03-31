"""Jobs models scaffold for the AI job hunting platform."""

import uuid

from django.db import models


class JobsTimestampedModel(models.Model):
    """Shared timestamped scaffold base."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Company(JobsTimestampedModel):
    name = models.CharField(max_length=255)
    website_url = models.URLField(blank=True)
    headquarters = models.CharField(max_length=255, blank=True)
    reputation_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        managed = False
        db_table = "jobs_companies"


class CompanyResearchSnapshot(JobsTimestampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    summary = models.TextField(blank=True)
    risk_signals = models.JSONField(default=list)
    growth_signals = models.JSONField(default=list)

    class Meta:
        managed = False
        db_table = "jobs_company_research_snapshots"


class JobSource(JobsTimestampedModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    base_url = models.URLField()
    adapter_key = models.CharField(max_length=120)
    trust_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    health_status = models.CharField(max_length=50, default="planned")

    class Meta:
        managed = False
        db_table = "jobs_sources"


class DiscoveryRun(JobsTimestampedModel):
    source = models.ForeignKey(JobSource, on_delete=models.CASCADE)
    status = models.CharField(max_length=50, default="queued")
    jobs_discovered = models.IntegerField(default=0)
    notes = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "jobs_discovery_runs"


class JobPosting(JobsTimestampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    source = models.ForeignKey(JobSource, on_delete=models.CASCADE)
    canonical_key = models.CharField(max_length=255, unique=True)
    title = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    work_mode = models.CharField(max_length=50, default="hybrid")
    application_url = models.URLField(blank=True)
    description = models.TextField(blank=True)
    salary_text = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=50, default="discovered")

    class Meta:
        managed = False
        db_table = "jobs_postings"


class JobSnapshot(JobsTimestampedModel):
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE)
    raw_payload = models.JSONField(default=dict)
    extracted_fields = models.JSONField(default=dict)

    class Meta:
        managed = False
        db_table = "jobs_snapshots"


class JobMatchScore(JobsTimestampedModel):
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE)
    candidate = models.ForeignKey("accounts.Profile", on_delete=models.CASCADE)
    match_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    shortlist_probability = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    recommendation = models.CharField(max_length=50, default="review")
    explanation = models.JSONField(default=list)
    missing_signals = models.JSONField(default=list)

    class Meta:
        managed = False
        db_table = "jobs_match_scores"


class JobDecision(JobsTimestampedModel):
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE)
    candidate = models.ForeignKey("accounts.Profile", on_delete=models.CASCADE)
    decision = models.CharField(max_length=50, default="review")
    reason = models.TextField(blank=True)

    class Meta:
        managed = False
        db_table = "jobs_decisions"


class JobApplication(JobsTimestampedModel):
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE)
    candidate = models.ForeignKey("accounts.Profile", on_delete=models.CASCADE)
    automation_mode = models.CharField(max_length=50, default="draft_only")
    status = models.CharField(max_length=50, default="draft")
    evidence_count = models.IntegerField(default=0)
    external_reference = models.CharField(max_length=255, blank=True)

    class Meta:
        managed = False
        db_table = "job_applications"


class JobApplicationStep(JobsTimestampedModel):
    job_application = models.ForeignKey(JobApplication, on_delete=models.CASCADE)
    step_type = models.CharField(max_length=50)
    status = models.CharField(max_length=50, default="queued")
    notes = models.TextField(blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "job_application_steps"

