"""Unit tests for synthesized legacy document rows in ApplicationDocumentsView."""

import uuid
from unittest.mock import patch, MagicMock

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.applications.student_document_views import ApplicationDocumentsView
from tests.factories import ApplicationFactory, ApplicationDocumentFactory, ProfileFactory


def _make_user(profile):
    """Wrap a Profile in a mock that has is_authenticated=True."""
    user = MagicMock()
    user.pk = profile.id
    user.id = profile.id
    user.is_authenticated = True
    user.role = profile.role
    return user


@pytest.mark.django_db
class TestSynthesizedLegacyDocuments:
    def setup_method(self):
        self.factory = APIRequestFactory()
        self.view = ApplicationDocumentsView.as_view()

    def _get(self, user, application_id):
        request = self.factory.get(f"/api/v1/applications/{application_id}/documents/")
        force_authenticate(request, user=user)
        return self.view(request, application_id=str(application_id))

    @patch("apps.common.storage.generate_signed_url")
    def test_synth_rows_when_no_matching_document(self, mock_signed):
        mock_signed.return_value = "https://signed.example.com/stub"
        profile = ProfileFactory()
        user = _make_user(profile)
        app = ApplicationFactory(user=profile, result_slip_url="media/slips/result.pdf", extra_kyc_url="media/kyc/id.pdf")
        response = self._get(user, app.id)
        assert response.status_code == 200
        data = response.data["data"]
        synth = [d for d in data if d.get("is_legacy_synthetic")]
        assert len(synth) == 2
        types = {d["document_type"] for d in synth}
        assert types == {"result_slip", "extra_kyc"}

    @patch("apps.common.storage.generate_signed_url")
    def test_no_duplicate_when_document_exists(self, mock_signed):
        mock_signed.return_value = "https://signed.example.com/stub"
        profile = ProfileFactory()
        user = _make_user(profile)
        app = ApplicationFactory(user=profile, result_slip_url="media/slips/result.pdf", extra_kyc_url=None)
        ApplicationDocumentFactory(application=app, document_type="result_slip", file_url="media/slips/result.pdf")
        response = self._get(user, app.id)
        assert response.status_code == 200
        data = response.data["data"]
        synth = [d for d in data if d.get("is_legacy_synthetic")]
        assert len(synth) == 0

    def test_no_synth_when_both_null(self):
        profile = ProfileFactory()
        user = _make_user(profile)
        app = ApplicationFactory(user=profile, result_slip_url=None, extra_kyc_url=None)
        response = self._get(user, app.id)
        assert response.status_code == 200
        data = response.data["data"]
        synth = [d for d in data if d.get("is_legacy_synthetic")]
        assert len(synth) == 0

    @patch("apps.common.storage.generate_signed_url")
    def test_signed_url_failure_handled_gracefully(self, mock_signed):
        mock_signed.side_effect = RuntimeError("S3 down")
        profile = ProfileFactory()
        user = _make_user(profile)
        app = ApplicationFactory(user=profile, result_slip_url="media/slips/result.pdf", extra_kyc_url=None)
        response = self._get(user, app.id)
        assert response.status_code == 200
        data = response.data["data"]
        synth = [d for d in data if d.get("is_legacy_synthetic")]
        assert len(synth) == 1
        assert synth[0]["file_url"] == "media/slips/result.pdf"
