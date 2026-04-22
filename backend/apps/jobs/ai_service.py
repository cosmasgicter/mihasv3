"""AI-powered jobs operations service.

Uses Vercel AI Gateway (via OpenAI SDK) for:
- Job match scoring against candidate profile
- Resume/cover letter tailoring for specific jobs
- Outreach message generation
- Job description analysis

All calls are best-effort. Failures return None, never block core flows.
"""

import json
import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client():
    from openai import OpenAI
    api_key = getattr(settings, "AI_GATEWAY_API_KEY", "")
    base_url = getattr(settings, "AI_GATEWAY_BASE_URL", "https://ai-gateway.vercel.sh/v1")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url=base_url)


def score_job_match(job_data: dict, candidate_data: dict) -> dict | None:
    """Score how well a job matches the candidate profile. Returns 0-100 score with reasoning."""
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    prompt = f"""Score this job match from 0-100 for the candidate. Return JSON only.

Job:
- Title: {job_data.get('title', 'N/A')}
- Company: {job_data.get('company', 'N/A')}
- Location: {job_data.get('location', 'N/A')}
- Description: {job_data.get('description', 'N/A')[:500]}
- Requirements: {job_data.get('requirements', 'N/A')[:300]}

Candidate:
- Skills: {candidate_data.get('skills', 'N/A')}
- Experience: {candidate_data.get('experience', 'N/A')}
- Education: {candidate_data.get('education', 'N/A')}
- Location: {candidate_data.get('location', 'N/A')}

Return: {{"score": 0-100, "reasons": ["reason1", "reason2"], "missing_skills": ["skill1"], "strengths": ["strength1"]}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("Job scoring failed")
        return None


def tailor_resume(job_data: dict, resume_text: str) -> dict | None:
    """Generate tailored resume bullet points and cover letter for a specific job."""
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_SMART", "deepseek/deepseek-v3")

    prompt = f"""Tailor this resume for the job below. Return JSON only.

Job:
- Title: {job_data.get('title', 'N/A')}
- Company: {job_data.get('company', 'N/A')}
- Requirements: {job_data.get('requirements', 'N/A')[:500]}

Current Resume (excerpt):
{resume_text[:1000]}

Return: {{
  "tailored_summary": "2-3 sentence professional summary tailored to this role",
  "key_achievements": ["achievement rewritten for this role", ...],
  "cover_letter": "3-paragraph cover letter",
  "keywords_to_add": ["keyword1", "keyword2"]
}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("Resume tailoring failed")
        return None


def generate_outreach_message(contact_data: dict, context: str = "") -> dict | None:
    """Generate a professional outreach email for a contact."""
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    prompt = f"""Write a professional outreach email. Return JSON only.

Contact:
- Name: {contact_data.get('name', 'N/A')}
- Company: {contact_data.get('company', 'N/A')}
- Role: {contact_data.get('role', 'N/A')}

Context: {context or 'General networking and opportunity exploration'}

Rules:
- Professional but warm tone
- Short (under 150 words)
- Clear call to action
- No fabricated claims about the sender

Return: {{"subject": "email subject", "body": "email body", "follow_up_days": 5}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("Outreach message generation failed")
        return None


def analyze_job_posting(description: str) -> dict | None:
    """Extract structured data from a job posting description."""
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    prompt = f"""Extract structured data from this job posting. Return JSON only.

{description[:2000]}

Return: {{
  "title": "job title",
  "company": "company name",
  "location": "location",
  "salary_range": "if mentioned",
  "employment_type": "full-time/part-time/contract",
  "experience_level": "entry/mid/senior",
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill1"],
  "education_requirement": "degree requirement",
  "key_responsibilities": ["resp1", "resp2"]
}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("Job posting analysis failed")
        return None
