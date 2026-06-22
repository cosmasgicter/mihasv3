"""Suite_Execution_Gate (Gate 6) — zero-warning OpenAPI schema assertion.

Spec: .kiro/specs/beanola-launch-verification (Task 11.2).

Requirement 6.5: OpenAPI schema generation completes with zero schema errors.
Requirement 6.6: OpenAPI schema generation completes with zero warnings,
including resolution of the ``CanonicalProgramSerializer.get_available_offerings``
schema warning (annotated with ``@extend_schema_field`` in Task 11.1).

drf-spectacular collects every emitted warning/error in the module-level
``GENERATOR_STATS`` caches (``drf_spectacular.drainage``). Generating the schema
through ``SchemaGenerator`` and inspecting those caches is deterministic and
needs no database, mirroring exactly what ``manage.py spectacular`` reports in
CI (the ``Warnings: N`` / ``Errors: N`` summary is computed from these caches).
"""

import os

from django.test import SimpleTestCase

# Match the rest of the suite: configure settings before touching Django.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("TESTING", "1")
# drf-spectacular's SchemaGenerator imports settings; provide a non-empty
# SECRET_KEY so the dev-default insecure-key warning path is not exercised.
os.environ.setdefault("SECRET_KEY", "launch-verification-test-secret-not-for-production")


def _generate_schema_and_collect_stats():
    """Generate the OpenAPI schema and return (schema, warnings, errors).

    ``warnings`` / ``errors`` are the de-duplicated message maps drf-spectacular
    accumulates while walking every registered view and serializer.
    """
    from drf_spectacular.drainage import GENERATOR_STATS
    from drf_spectacular.generators import SchemaGenerator

    # Start from a clean slate so we only observe this run's diagnostics.
    GENERATOR_STATS.reset()
    schema = SchemaGenerator().get_schema(request=None, public=True)
    warnings = dict(GENERATOR_STATS._warn_cache)
    errors = dict(GENERATOR_STATS._error_cache)
    GENERATOR_STATS.reset()
    return schema, warnings, errors


class LaunchVerificationSpectacularTests(SimpleTestCase):
    """Gate 6 zero-error / zero-warning schema-generation evidence."""

    def test_schema_generation_produces_a_non_trivial_schema(self):
        """Sanity: the generator actually walks the API surface."""
        schema, _warnings, _errors = _generate_schema_and_collect_stats()
        self.assertIn("paths", schema)
        self.assertGreater(
            len(schema["paths"]),
            50,
            "Schema has suspiciously few paths — generation likely degraded.",
        )

    def test_schema_generation_emits_zero_errors(self):
        """R6.5: OpenAPI schema generation reports zero errors."""
        _schema, _warnings, errors = _generate_schema_and_collect_stats()
        total_errors = sum(errors.values())
        self.assertEqual(
            total_errors,
            0,
            "Expected zero drf-spectacular errors, got "
            f"{total_errors}:\n" + "\n".join(errors),
        )

    def test_schema_generation_emits_zero_warnings(self):
        """R6.6: OpenAPI schema generation reports zero warnings."""
        _schema, warnings, _errors = _generate_schema_and_collect_stats()
        total_warnings = sum(warnings.values())
        self.assertEqual(
            total_warnings,
            0,
            "Expected zero drf-spectacular warnings, got "
            f"{total_warnings}:\n" + "\n".join(warnings),
        )

    def test_get_available_offerings_warning_is_resolved(self):
        """R6.6: the CanonicalProgramSerializer.get_available_offerings warning is gone.

        Task 11.1 annotated ``get_available_offerings`` with
        ``@extend_schema_field(ProgramSerializer(many=True))``; without it
        drf-spectacular cannot infer the SerializerMethodField type and emits a
        warning naming that method/field. Assert no such warning remains.
        """
        _schema, warnings, _errors = _generate_schema_and_collect_stats()
        offending = [
            message
            for message in warnings
            if "get_available_offerings" in message or "available_offerings" in message
        ]
        self.assertEqual(
            offending,
            [],
            "The get_available_offerings schema warning is not resolved:\n"
            + "\n".join(offending),
        )
