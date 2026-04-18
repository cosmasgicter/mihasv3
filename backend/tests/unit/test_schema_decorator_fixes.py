"""Unit tests for drf-spectacular schema decorator placement.

Validates that @extend_schema decorators are correctly placed on individual
HTTP methods (not at the class level) for TimelineHistoryView and
AdminNotificationHistoryView, and that schema generation produces no warnings.

Requirements: 2.3, 3.4
"""

import os
import warnings

from django.test import SimpleTestCase, override_settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"


class TestTimelineHistoryViewSchemaDecorator(SimpleTestCase):
    """Verify @extend_schema is on the get method with correct operation_id."""

    def test_get_method_has_extend_schema_decorator(self):
        """The get method must have drf-spectacular schema metadata (kwargs['schema'])."""
        from apps.applications.history_views import TimelineHistoryView

        get_method = TimelineHistoryView.get
        self.assertTrue(
            hasattr(get_method, "kwargs") and "schema" in getattr(get_method, "kwargs", {}),
            "TimelineHistoryView.get is missing @extend_schema decorator metadata",
        )

    def test_get_method_operation_id_is_correct(self):
        """The operation_id stored in the ExtendedSchema closure must be 'timeline_history_list'."""
        from apps.applications.history_views import TimelineHistoryView

        schema_cls = TimelineHistoryView.get.kwargs["schema"]
        # drf-spectacular stores the operation_id in the closure of get_operation_id
        get_op_id_fn = schema_cls.get_operation_id
        closure_cells = get_op_id_fn.__closure__ or []
        closure_values = []
        for cell in closure_cells:
            try:
                closure_values.append(cell.cell_contents)
            except ValueError:
                pass

        self.assertIn(
            "timeline_history_list",
            closure_values,
            f"Expected 'timeline_history_list' in ExtendedSchema closure, got {closure_values}",
        )


class TestAdminNotificationHistoryViewSchemaDecorator(SimpleTestCase):
    """Verify @extend_schema is on the get method with correct operation_id."""

    def test_get_method_has_extend_schema_decorator(self):
        """The get method must have drf-spectacular schema metadata (kwargs['schema'])."""
        from apps.common.notification_views import AdminNotificationHistoryView

        get_method = AdminNotificationHistoryView.get
        self.assertTrue(
            hasattr(get_method, "kwargs") and "schema" in getattr(get_method, "kwargs", {}),
            "AdminNotificationHistoryView.get is missing @extend_schema decorator metadata",
        )

    def test_get_method_operation_id_is_correct(self):
        """The operation_id stored in the ExtendedSchema closure must be 'admin_notification_history'."""
        from apps.common.notification_views import AdminNotificationHistoryView

        schema_cls = AdminNotificationHistoryView.get.kwargs["schema"]
        get_op_id_fn = schema_cls.get_operation_id
        closure_cells = get_op_id_fn.__closure__ or []
        closure_values = []
        for cell in closure_cells:
            try:
                closure_values.append(cell.cell_contents)
            except ValueError:
                pass

        self.assertIn(
            "admin_notification_history",
            closure_values,
            f"Expected 'admin_notification_history' in ExtendedSchema closure, got {closure_values}",
        )


@override_settings(DEBUG=True)
class TestSchemaGenerationNoWarnings(SimpleTestCase):
    """Verify schema generation produces no warnings for these views."""

    def test_schema_generation_no_warnings_for_decorated_views(self):
        """Generate the full OpenAPI schema and assert no drf-spectacular warnings."""
        from drf_spectacular.generators import SchemaGenerator

        generator = SchemaGenerator(patterns=None)

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            generator.get_schema(request=None, public=True)

        # Filter for drf-spectacular or operation_id related warnings
        spectacular_warnings = [
            w for w in caught
            if "spectacular" in str(w.category).lower()
            or "spectacular" in str(w.message).lower()
            or "operation_id" in str(w.message).lower()
        ]

        warning_messages = [str(w.message) for w in spectacular_warnings]
        self.assertEqual(
            spectacular_warnings,
            [],
            f"drf-spectacular emitted warnings: {warning_messages}",
        )

    def test_schema_contains_correct_operation_ids(self):
        """Verify the generated schema has the expected operation IDs."""
        from drf_spectacular.generators import SchemaGenerator

        generator = SchemaGenerator(patterns=None)
        schema = generator.get_schema(request=None, public=True)

        operation_ids = set()
        paths = schema.get("paths", {})
        for _path, methods in paths.items():
            for _method, details in methods.items():
                if isinstance(details, dict) and "operationId" in details:
                    operation_ids.add(details["operationId"])

        self.assertIn(
            "timeline_history_list",
            operation_ids,
            "timeline_history_list operation_id missing from generated schema",
        )
        self.assertIn(
            "admin_notification_history",
            operation_ids,
            "admin_notification_history operation_id missing from generated schema",
        )
