# backend/apps/applications/identifier_resolver.py

from dataclasses import dataclass
from apps.catalog.models import Institution, Intake, Program


@dataclass(frozen=True)
class ResolvedIdentifier:
    id: str          # UUID
    code: str        # e.g. "DRN"
    name: str        # e.g. "Diploma in Registered Nursing"
    source: str      # "name", "code", "full_name", or "not_found"


class IdentifierResolver:
    """Resolves mixed name/code identifiers to canonical catalog records."""

    @staticmethod
    def resolve_program(value: str) -> ResolvedIdentifier:
        """Try name first, then code. Returns canonical name."""
        prog = Program.objects.filter(name=value, is_active=True).first()
        if prog:
            return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "name")
        prog = Program.objects.filter(code=value, is_active=True).first()
        if prog:
            return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "code")
        return ResolvedIdentifier("", "", value, "not_found")

    @staticmethod
    def resolve_institution(value: str) -> ResolvedIdentifier:
        """Try code first, then name, then full_name."""
        inst = Institution.objects.filter(code=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "code")
        inst = Institution.objects.filter(name=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "name")
        inst = Institution.objects.filter(full_name=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "full_name")
        return ResolvedIdentifier("", "", value, "not_found")

    @staticmethod
    def resolve_intake(value: str) -> ResolvedIdentifier:
        """Try name first against active Intake records."""
        intake = Intake.objects.filter(name=value, is_active=True).first()
        if intake:
            return ResolvedIdentifier(str(intake.id), "", intake.name, "name")
        return ResolvedIdentifier("", "", value, "not_found")
