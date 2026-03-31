"""Shared seeded data for the Jobs Ops v1 scaffold."""

from django.utils import timezone


def build_action_payload(reference_id, message, action_status="queued"):
    return {
        "message": message,
        "status": action_status,
        "reference_id": reference_id,
    }


def sample_jobs():
    return [
        {
            "id": "7db809ec-6655-4bf0-93b5-38b778342680",
            "title": "Senior Data Analyst",
            "company": "Impact Finance Africa",
            "location": "Lusaka, Zambia",
            "work_mode": "hybrid",
            "match_score": 91,
            "recommendation": "apply_now",
        },
        {
            "id": "270f9d66-8859-4a8d-9062-e4efbc637b4f",
            "title": "Programme Operations Associate",
            "company": "Regional NGO Network",
            "location": "Nairobi, Kenya",
            "work_mode": "remote",
            "match_score": 83,
            "recommendation": "review",
        },
        {
            "id": "bd249f7a-f9d5-4d2b-9dcb-bf219ef126cb",
            "title": "Digital Transformation Lead",
            "company": "Copperbelt Growth Fund",
            "location": "Kitwe, Zambia",
            "work_mode": "on_site",
            "match_score": 74,
            "recommendation": "watch",
        },
    ]


def sample_job_detail(job_id):
    details = {
        "7db809ec-6655-4bf0-93b5-38b778342680": {
            "id": job_id,
            "title": "Senior Data Analyst",
            "company": "Impact Finance Africa",
            "location": "Lusaka, Zambia",
            "work_mode": "hybrid",
            "match_score": 91,
            "recommendation": "apply_now",
            "application_url": "https://example.com/jobs/senior-data-analyst",
            "fit_reasons": [
                "Strong overlap between analytics and operations ownership.",
                "Location and work mode are aligned with current preferences.",
                "The role rewards measurable reporting and decision support.",
            ],
            "missing_signals": [
                "Expand SQL and dashboard governance keywords in the resume variant.",
                "Clarify quantified outcomes from the last major project.",
            ],
            "source_names": ["impact-finance-africa", "regional-careers-feed"],
        },
        "270f9d66-8859-4a8d-9062-e4efbc637b4f": {
            "id": job_id,
            "title": "Programme Operations Associate",
            "company": "Regional NGO Network",
            "location": "Nairobi, Kenya",
            "work_mode": "remote",
            "match_score": 83,
            "recommendation": "review",
            "application_url": "https://example.com/jobs/programme-operations-associate",
            "fit_reasons": [
                "Remote setup and sector alignment make this strategically attractive.",
                "The role values coordination, reporting, and cross-functional execution.",
            ],
            "missing_signals": [
                "Stronger donor-reporting examples would improve shortlist confidence.",
                "Needs a more targeted programme-operations resume variant.",
            ],
            "source_names": ["regional-careers-feed", "ngo-opportunities-africa"],
        },
        "bd249f7a-f9d5-4d2b-9dcb-bf219ef126cb": {
            "id": job_id,
            "title": "Digital Transformation Lead",
            "company": "Copperbelt Growth Fund",
            "location": "Kitwe, Zambia",
            "work_mode": "on_site",
            "match_score": 74,
            "recommendation": "watch",
            "application_url": "https://example.com/jobs/digital-transformation-lead",
            "fit_reasons": [
                "Strong strategic value if location and compensation become acceptable.",
                "Leadership scope fits longer-term career goals.",
            ],
            "missing_signals": [
                "On-site requirement may conflict with current work-mode preferences.",
                "Needs stronger enterprise change-program examples.",
            ],
            "source_names": ["copperbelt-growth-fund"],
        },
    }
    return details.get(str(job_id), details["7db809ec-6655-4bf0-93b5-38b778342680"])


def sample_job_applications():
    return [
        {
            "id": "1f12ed0f-50d8-4370-bc02-04f01102483f",
            "job_id": "7db809ec-6655-4bf0-93b5-38b778342680",
            "title": "Senior Data Analyst",
            "company": "Impact Finance Africa",
            "status": "awaiting_approval",
            "automation_mode": "draft_only",
            "evidence_count": 3,
            "updated_at": timezone.now(),
        },
        {
            "id": "d83038ee-73c8-4796-bddb-dcf6f0f7b4d0",
            "job_id": "270f9d66-8859-4a8d-9062-e4efbc637b4f",
            "title": "Programme Operations Associate",
            "company": "Regional NGO Network",
            "status": "submitted",
            "automation_mode": "assisted_auto",
            "evidence_count": 7,
            "updated_at": timezone.now(),
        },
        {
            "id": "c3fd74dc-1f80-4e79-95cf-acf41577ce50",
            "job_id": "bd249f7a-f9d5-4d2b-9dcb-bf219ef126cb",
            "title": "Digital Transformation Lead",
            "company": "Copperbelt Growth Fund",
            "status": "watch_only",
            "automation_mode": "watch_only",
            "evidence_count": 1,
            "updated_at": timezone.now(),
        },
    ]


def sample_outreach_contacts():
    return [
        {
            "id": "7c8be2be-8cec-48af-a4fd-f4cf5c4f08b4",
            "full_name": "Thandiwe Mulenga",
            "email": "thandiwe@example.org",
            "company": "Regional NGO Network",
            "role": "Programme Director",
            "relationship_status": "warm",
            "tags": ["ngo", "referral", "east-africa"],
        },
        {
            "id": "5aa74ae1-e438-4bd2-a525-1d0569e8ef52",
            "full_name": "Rabecca Chanda",
            "email": "rabecca@example.net",
            "company": "Impact Finance Africa",
            "role": "Talent Partner",
            "relationship_status": "contacted",
            "tags": ["recruiter", "follow_up"],
        },
    ]


def sample_outreach_campaigns():
    return [
        {
            "id": "ce54fb10-e17d-41b8-bdb3-e0197e099741",
            "name": "Warm referrals Q2",
            "campaign_type": "referral_request",
            "status": "draft",
            "target_count": 12,
        },
        {
            "id": "2dcad499-51eb-4f4f-bb31-335d600538c1",
            "name": "Recruiter follow-ups",
            "campaign_type": "application_follow_up",
            "status": "active",
            "target_count": 5,
        },
    ]


def sample_automation_rules():
    return [
        {
            "id": "8dc62f91-0b7b-49c4-b4fd-6305fb1154f8",
            "name": "High confidence apply threshold",
            "rule_type": "auto_apply_cap",
            "is_enabled": False,
            "config": {"minimum_match_score": 92, "daily_cap": 3},
        },
        {
            "id": "177bdb06-851b-4760-bb83-8d0d90d680cb",
            "name": "Outreach cooldown",
            "rule_type": "contact_cooldown",
            "is_enabled": True,
            "config": {"minimum_days_between_messages": 10},
        },
    ]


def sample_automation_runs():
    return [
        {
            "id": "2d0eaf86-5fe2-4f39-baec-c1b7b183c157",
            "run_type": "job_application_submit",
            "status": "blocked",
            "trigger_source": "job_applications.submit",
            "summary": "Impact Finance application paused before final submission.",
            "blocked_reason": "Manual authentication checkpoint required.",
            "updated_at": timezone.now(),
        },
        {
            "id": "4d47235d-a552-4c16-9bf6-04b6b0130168",
            "run_type": "job_discovery",
            "status": "completed",
            "trigger_source": "jobs.discovery",
            "summary": "Morning discovery run completed across three configured source groups.",
            "blocked_reason": "",
            "updated_at": timezone.now(),
        },
        {
            "id": "6227ecdc-279d-4bb0-b278-fc2864545d28",
            "run_type": "outreach_send",
            "status": "running",
            "trigger_source": "outreach.messages.send",
            "summary": "Recruiter follow-up sequence is pacing outbound messages.",
            "blocked_reason": "",
            "updated_at": timezone.now(),
        },
    ]


def sample_email_threads():
    return [
        {
            "id": "420dbbdd-fa7a-4ebb-9a0b-cfd70551017a",
            "subject": "Senior Data Analyst follow-up",
            "thread_key": "zoho-thread-scaffold-1",
            "status": "open",
        },
        {
            "id": "e44804a6-798f-4f3b-88b0-80728d69389d",
            "subject": "Referral introduction to Regional NGO Network",
            "thread_key": "zoho-thread-scaffold-2",
            "status": "awaiting_reply",
        },
    ]


def sample_email_messages():
    return [
        {
            "id": "8ee5d8c5-b4a5-49f6-a7d5-48df6097dbdb",
            "thread_id": sample_email_threads()[0]["id"],
            "direction": "outbound",
            "sender": "operator@example.com",
            "recipient": "recruiter@example.com",
            "subject": sample_email_threads()[0]["subject"],
            "body_preview": "Scaffold message preview for a follow-up or introduction.",
            "classification": "positive_signal_pending_review",
        },
        {
            "id": "1d1f0f56-f8f6-43af-8025-c4ac77346645",
            "thread_id": sample_email_threads()[1]["id"],
            "direction": "inbound",
            "sender": "director@example.org",
            "recipient": "operator@example.com",
            "subject": sample_email_threads()[1]["subject"],
            "body_preview": "Thanks for the thoughtful note. Please share the resume variant tailored to programme operations.",
            "classification": "request_for_more_info",
        },
    ]


def sample_resume_assets():
    return [
        {
            "id": "12038f87-f0ec-4ea0-8b28-15423c1d299f",
            "name": "Master Resume",
            "asset_type": "resume_master",
            "target_role": "general",
            "status": "active",
            "updated_at": timezone.now(),
        },
        {
            "id": "20f8aeed-b370-4206-9e8c-f216fe237492",
            "name": "NGO Operations Variant",
            "asset_type": "resume_variant",
            "target_role": "programme_operations",
            "status": "draft",
            "updated_at": timezone.now(),
        },
        {
            "id": "cb740a32-18ef-4476-a13b-2a638ed6f93f",
            "name": "Executive Strategy Variant",
            "asset_type": "resume_variant",
            "target_role": "strategy_leadership",
            "status": "review",
            "updated_at": timezone.now(),
        },
    ]


def sample_funnel_analytics():
    return {"discovered": 48, "reviewed": 21, "applied": 13, "interviews": 3, "offers": 0}


def sample_source_analytics():
    return [
        {"source": "impact-finance-africa", "freshness_hours": 2, "duplicate_ratio": 0.08, "success_rate": 0.94},
        {"source": "regional-careers-feed", "freshness_hours": 9, "duplicate_ratio": 0.11, "success_rate": 0.88},
        {"source": "ngo-opportunities-africa", "freshness_hours": 5, "duplicate_ratio": 0.06, "success_rate": 0.91},
    ]


def sample_outreach_analytics():
    return {"campaigns_sent": 5, "positive_replies": 2, "interviews_generated": 1}


def sample_daily_digest():
    return {
        "headline": "3 high-value roles surfaced today",
        "summary": "The scaffold daily digest summarizes discovery, approvals, outreach, and source health until real reporting is wired.",
        "generated_at": timezone.now(),
    }
