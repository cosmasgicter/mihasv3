# backend/apps/applications/identifier_resolver.py

from dataclasses import dataclass
from uuid import UUID

from django.core.exceptions import ValidationError

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
    def _looks_like_uuid(value: str) -> bool:
        try:
            UUID(str(value))
            return True
        except (TypeError, ValueError, AttributeError):
            return False

    @staticmethod
    def resolve_program(value: str) -> ResolvedIdentifier:
        """Try UUID id first when applicable, then name (case-insensitive), then code."""
        if IdentifierResolver._looks_like_uuid(value):
            try:
                prog = Program.objects.filter(id=value, is_active=True).first()
                if prog:
                    return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "id")
            except (ValidationError, ValueError):
                pass
        prog = Program.objects.filter(name__iexact=value, is_active=True).first()
        if prog:
            return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "name")
        prog = Program.objects.filter(code__iexact=value, is_active=True).first()
        if prog:
            return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "code")
        # Fallback: contains match for partial names
        prog = Program.objects.filter(name__icontains=value, is_active=True).first()
        if prog:
            return ResolvedIdentifier(str(prog.id), prog.code, prog.name, "name_partial")
        return ResolvedIdentifier("", "", value, "not_found")

    @staticmethod
    def resolve_institution(value: str) -> ResolvedIdentifier:
        """Try code first, then name (case-insensitive), then full_name."""
        inst = Institution.objects.filter(code__iexact=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "code")
        inst = Institution.objects.filter(name__iexact=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "name")
        inst = Institution.objects.filter(full_name__iexact=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "full_name")
        # Fallback: contains match
        inst = Institution.objects.filter(name__icontains=value, is_active=True).first()
        if inst:
            return ResolvedIdentifier(str(inst.id), inst.code, inst.name, "name_partial")
        return ResolvedIdentifier("", "", value, "not_found")

    @staticmethod
    def resolve_intake(value: str) -> ResolvedIdentifier:
        """Try UUID id first when applicable, then name (case-insensitive) against active Intake records."""
        if IdentifierResolver._looks_like_uuid(value):
            try:
                intake = Intake.objects.filter(id=value, is_active=True).first()
                if intake:
                    return ResolvedIdentifier(str(intake.id), "", intake.name, "id")
            except (ValidationError, ValueError):
                pass
        intake = Intake.objects.filter(name__iexact=value, is_active=True).first()
        if intake:
            return ResolvedIdentifier(str(intake.id), "", intake.name, "name")
        # Fallback: contains match
        intake = Intake.objects.filter(name__icontains=value, is_active=True).first()
        if intake:
            return ResolvedIdentifier(str(intake.id), "", intake.name, "name_partial")
        return ResolvedIdentifier("", "", value, "not_found")
