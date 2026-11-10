"""Platform metadata must describe the admissions platform."""

from rest_framework.test import APIRequestFactory

from apps.common.meta_views import PlatformMetaView


def test_platform_meta_uses_beanola_admissions_domain():
    request = APIRequestFactory().get("/api/v1/meta/platform/")
    response = PlatformMetaView.as_view()(request)

    assert response.status_code == 200
    assert response.data["product"] == "Beanola Admissions Platform"
    assert response.data["developer"]["name"] == "Beanola Technologies"
    assert "status" not in response.data


def test_platform_meta_reports_jobs_ops_configuration(settings):
    """R3.1: readiness is configuration, never a fixed claim."""
    for flag in (True, False):
        settings.ENABLE_JOBS_OPS_ROUTES = flag
        request = APIRequestFactory().get("/api/v1/meta/platform/")
        response = PlatformMetaView.as_view()(request)
        assert response.data["features"] == {"jobs_ops": flag}
        assert "max-age=86400" in response["Cache-Control"]
