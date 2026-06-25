"""Platform metadata must describe the admissions platform."""

from rest_framework.test import APIRequestFactory

from apps.common.meta_views import PlatformMetaView


def test_platform_meta_uses_beanola_admissions_domain():
    request = APIRequestFactory().get("/api/v1/meta/platform/")
    response = PlatformMetaView.as_view()(request)

    assert response.status_code == 200
    assert response.data["product"] == "Beanola Admissions Platform"
    assert response.data["developer"]["name"] == "Beanola Technologies"
    assert response.data["status"] == "production_ready"
