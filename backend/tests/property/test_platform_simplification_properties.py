"""Properties for the platform-simplification-and-polish spec.

Property numbers are those of
``.kiro/specs/platform-simplification-and-polish/design.md``.
"""
from hypothesis import given, settings
from hypothesis import strategies as st
from django.test import override_settings
from rest_framework.test import APIRequestFactory

from apps.common.meta_views import PlatformMetaView


# Feature: platform-simplification-and-polish, Property 8: Metadata reports configuration, never a fixed readiness
# Validates: Requirements 3.1
@settings(max_examples=20, deadline=None)
@given(flag=st.booleans())
def test_property_8_metadata_reports_configuration_never_fixed_readiness(flag):
    with override_settings(ENABLE_JOBS_OPS_ROUTES=flag):
        request = APIRequestFactory().get("/api/v1/meta/platform/")
        response = PlatformMetaView.as_view()(request)
    assert response.status_code == 200
    assert response.data["features"]["jobs_ops"] is flag
    assert "status" not in response.data
