"""AI service — Vercel AI Gateway integration.

Uses the OpenAI Python SDK pointed at Vercel AI Gateway for:
- Document OCR (vision model)
- Application review assistance
- Text extraction and analysis

All AI calls are best-effort — failures never block core flows.
"""

import base64
import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client():
    """Lazy-init OpenAI client pointed at Vercel AI Gateway."""
    from openai import OpenAI

    api_key = getattr(settings, "AI_GATEWAY_API_KEY", "")
    base_url = getattr(settings, "AI_GATEWAY_BASE_URL", "https://ai-gateway.vercel.sh/v1")

    if not api_key:
        return None

    return OpenAI(api_key=api_key, base_url=base_url)


def extract_text_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str | None:
    """Extract text from an image using AI vision model.

    Replaces Tesseract OCR with Vercel AI Gateway vision.
    Returns extracted text or None on failure.
    """
    client = _get_client()
    if not client:
        logger.warning("AI Gateway not configured — skipping vision OCR")
        return None

    model = getattr(settings, "AI_MODEL_VISION", "google/gemini-2.5-flash")
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract ALL text from this document image. Return only the extracted text, preserving the layout as much as possible. If this is an ID document (NRC, passport), extract all fields including name, number, date of birth, etc."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                ],
            }],
            max_tokens=2000,
            temperature=0,
        )
        text = response.choices[0].message.content
        logger.info("AI vision OCR extracted %d chars", len(text or ""))
        return text
    except Exception:
        logger.exception("AI vision OCR failed")
        return None


def summarize_application(application_data: dict) -> str | None:
    """Generate a brief admin summary of an application.

    Used in the admin review panel to help admins quickly assess applications.
    """
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    prompt = f"""Summarize this student application in 3-4 bullet points for an admissions reviewer.
Focus on: qualifications, program fit, any red flags or notable strengths.

Application data:
- Name: {application_data.get('full_name', 'N/A')}
- Program: {application_data.get('program', 'N/A')}
- Status: {application_data.get('status', 'N/A')}
- Payment: {application_data.get('payment_status', 'N/A')}
- Grades: {application_data.get('grades_summary', 'N/A')}
- Nationality: {application_data.get('nationality', 'N/A')}
- Institution: {application_data.get('institution', 'N/A')}

Keep it concise and factual. No speculation."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.1,
        )
        return response.choices[0].message.content
    except Exception:
        logger.exception("AI application summary failed")
        return None


def analyze_document(text: str, document_type: str = "result_slip") -> dict | None:
    """Analyze extracted document text and return structured data.

    For result slips: extract subjects and grades.
    For ID documents: extract name, number, DOB.
    """
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    if document_type == "result_slip":
        prompt = f"""Extract subjects and grades from this Zambian ECZ result slip text.
Return a JSON object with:
{{"subjects": [{{"name": "English", "grade": 3}}, ...], "exam_number": "...", "year": "..."}}

Only include subjects you can clearly identify. Use the ECZ 1-9 grade scale.

Text:
{text}"""
    else:
        prompt = f"""Extract identity information from this document text.
Return a JSON object with:
{{"full_name": "...", "document_number": "...", "date_of_birth": "...", "nationality": "..."}}

Only include fields you can clearly identify.

Text:
{text}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt + "\n\nReturn ONLY valid JSON, no markdown or explanation."}],
            max_tokens=500,
            temperature=0,
        )
        import json
        return json.loads(response.choices[0].message.content)
    except Exception:
        logger.exception("AI document analysis failed")
        return None


def generate_student_preview_summary(application_data: dict) -> str | None:
    """Generate a personalized, encouraging summary for the student review step.

    This appears on the wizard's final review page to make the student feel
    their application is complete and personal.
    """
    client = _get_client()
    if not client:
        return None

    model = getattr(settings, "AI_MODEL_FAST", "google/gemini-2.5-flash")

    name = application_data.get('full_name', 'Student')
    first_name = name.split()[0] if name else 'Student'
    program = application_data.get('program', 'your chosen programme')
    institution = application_data.get('institution', 'MIHAS')
    grades = application_data.get('grades_summary', '')
    subjects_count = application_data.get('subjects_count', 0)
    intake = application_data.get('intake', '')

    prompt = f"""Write a brief, warm, personalized 2-3 sentence summary for {first_name} who is about to submit their application to {institution} for {program}.

Details:
- Subjects recorded: {subjects_count}
- Grades: {grades or 'entered'}
- Intake: {intake}

The tone should be:
- Encouraging but professional
- Personal (use their first name)
- Acknowledge their specific programme choice
- Brief (2-3 sentences max, no bullet points)

Example style: "{first_name}, your application for {program} is looking strong. With your {subjects_count} recorded subjects, you've met the documentation requirements. Once submitted, the admissions team will review your application promptly."

Do NOT mention payment status, fees, or anything negative. Keep it positive and forward-looking."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception:
        logger.exception("AI student preview summary failed")
        return None
