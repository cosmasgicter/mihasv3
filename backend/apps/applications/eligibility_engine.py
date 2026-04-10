# backend/apps/applications/eligibility_engine.py

from dataclasses import dataclass, field
from apps.catalog.models import CourseRequirement
from apps.documents.models import ApplicationGrade


@dataclass(frozen=True)
class ExplainableRuleResult:
    rule_code: str
    severity: str          # "critical", "major", "minor"
    result: bool           # True = passed
    message: str
    blocking: bool
    source: str            # "course_requirements"
    recommended_action: str


@dataclass
class EligibilityResult:
    status: str            # "eligible", "not_eligible", "conditional", "under_review"
    score: int             # 0-100
    results: list[ExplainableRuleResult] = field(default_factory=list)
    missing_requirements: list[dict] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


class EligibilityEngine:
    """Evaluates student grades against CourseRequirement records."""

    def evaluate(self, application_id: str, program_name: str) -> EligibilityResult:
        from apps.applications.identifier_resolver import IdentifierResolver

        resolved = IdentifierResolver.resolve_program(program_name)
        if resolved.source == "not_found":
            return EligibilityResult(
                status="under_review", score=0,
                recommendations=["Program not found. Please consult the institution."],
            )

        requirements = CourseRequirement.objects.filter(
            program_id=resolved.id
        ).select_related("subject")

        if not requirements.exists():
            return EligibilityResult(
                status="under_review", score=0,
                recommendations=["No course requirements configured. Please consult the institution."],
            )

        grades = {
            str(g.subject_id): g.grade
            for g in ApplicationGrade.objects.filter(application_id=application_id)
        }

        results = []
        total_weight = 0
        weighted_score = 0

        for req in requirements:
            weight = float(req.weight or 1)
            total_weight += weight
            subject_name = req.subject.name if req.subject else "Unknown"
            student_grade = grades.get(str(req.subject_id))

            if student_grade is None:
                results.append(ExplainableRuleResult(
                    rule_code=f"REQ_{req.id}",
                    severity="critical" if req.is_mandatory else "minor",
                    result=False,
                    message=f"Missing grade for {subject_name}",
                    blocking=False,
                    source="course_requirements",
                    recommended_action=f"Submit grade for {subject_name}",
                ))
                continue

            passed = student_grade <= req.minimum_grade
            if passed:
                weighted_score += weight
            results.append(ExplainableRuleResult(
                rule_code=f"REQ_{req.id}",
                severity="critical" if req.is_mandatory and not passed else "minor",
                result=passed,
                message=(
                    f"{subject_name}: Grade {student_grade} meets requirement (≤ {req.minimum_grade})"
                    if passed else
                    f"{subject_name}: Grade {student_grade} does not meet minimum grade {req.minimum_grade}"
                ),
                blocking=False,
                source="course_requirements",
                recommended_action="" if passed else f"Improve {subject_name} to grade {req.minimum_grade} or better",
            ))

        score = round((weighted_score / total_weight) * 100) if total_weight > 0 else 0
        mandatory_failed = [r for r in results if not r.result and r.severity == "critical"]
        optional_failed = [r for r in results if not r.result and r.severity == "minor"]

        if not mandatory_failed and not optional_failed:
            elig_status = "eligible"
        elif not mandatory_failed and optional_failed:
            elig_status = "conditional"
        else:
            elig_status = "not_eligible"

        missing = [
            {"type": "grade", "description": r.message, "severity": r.severity, "suggestion": r.recommended_action}
            for r in results if not r.result
        ]

        return EligibilityResult(
            status=elig_status, score=score, results=results,
            missing_requirements=missing,
            recommendations=[r.recommended_action for r in results if not r.result and r.recommended_action],
        )
