"""OCR opt-in policy, backend gate and command (platform-simplification task 18.1).

Decision D4 option B, Requirements 11.2 and 11.4 (also 22.1, 22.12):

* the extract endpoint enqueues OCR only for an opted-in institution and answers
  409 ``OCR_NOT_ENABLED`` with no task otherwise, *after* the scoped authorization;
* the task re-checks the policy when it runs;
* the opt-in is read and changed only through
  ``/api/v1/admin/documents/ocr-opt-in/`` (``platform.settings.manage``), and every
  change leaves one ``settings.change`` audit row;
* the generic admin settings endpoints never list, return or write the key.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.common.models import AuditLog, Setting
from apps.documents import ocr_policy
from apps.documents.models import ApplicationDocument
from tests.ocr_fixtures import opt_in_ocr
from tests.tenant_fixtures import (
    build_document,
    build_institution,
    build_profile,
    build_tenant_world,
)

OPT_IN_URL = "/api/v1/admin/documents/ocr-opt-in/"
KEY = ocr_policy.OCR_OPT_IN_SETTING_KEY
_TASK_PATH = "apps.documents.tasks.extract_document_text_task"


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


def _post_extract(client, document_id):
    with patch(_TASK_PATH) as task_mock:
        task_mock.delay.return_value = MagicMock(id="task-1")
        response = client.post(f"/api/v1/documents/{document_id}/extract/", data={}, format="json")
    return response, task_mock.delay


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPolicy:
    def test_missing_row_means_off_everywhere(self):
        assert not Setting.objects.filter(key=KEY).exists()
        assert ocr_policy.opted_in_institution_ids() == []
        assert ocr_policy.is_ocr_enabled_for_institution(uuid.uuid4()) is False

    @pytest.mark.parametrize("value", [{"a": 1}, "x", [1], ["not-a-uuid"], None])
    def test_malformed_value_means_off(self, value, caplog):
        institution = build_institution()
        Setting.objects.create(key=KEY, value=value if value is not None else 0, category="documents")
        assert ocr_policy.is_ocr_enabled_for_institution(institution.id) is False

    def test_listed_institution_is_on_and_others_off(self):
        on, off = build_institution(), build_institution()
        opt_in_ocr(on)
        assert ocr_policy.is_ocr_enabled_for_institution(on.id) is True
        assert ocr_policy.is_ocr_enabled_for_institution(str(on.id)) is True
        assert ocr_policy.is_ocr_enabled_for_institution(off.id) is False
        assert ocr_policy.is_ocr_enabled_for_institution(None) is False

    def test_application_without_institution_counts_as_off(self):
        application = MagicMock(institution_ref_id=None)
        assert ocr_policy.is_ocr_enabled_for_application(application) is False
        assert ocr_policy.is_ocr_enabled_for_application(None) is False


# ---------------------------------------------------------------------------
# Extract endpoint gate
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestExtractGate:
    def test_not_opted_in_answers_409_and_queues_nothing(self):
        world = build_tenant_world(application_status="draft")
        document = build_document(application=world.application, document_type="result_slip")
        response, delay = _post_extract(_client_for(world.student), document.id)
        assert response.status_code == 409
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "OCR_NOT_ENABLED"
        delay.assert_not_called()
        document.refresh_from_db()
        # Nothing was written: the endpoint did not mark a job pending.
        assert document.extraction_state is None

    def test_opted_in_queues_one_task(self):
        world = build_tenant_world(application_status="draft")
        opt_in_ocr(world.institution)
        document = build_document(application=world.application, document_type="result_slip")
        response, delay = _post_extract(_client_for(world.student), document.id)
        assert response.status_code == 202, response.content
        assert delay.call_count == 1

    def test_other_institution_opted_in_does_not_enable_this_one(self):
        world = build_tenant_world(application_status="draft")
        opt_in_ocr(build_institution())
        document = build_document(application=world.application, document_type="result_slip")
        response, delay = _post_extract(_client_for(world.student), document.id)
        assert response.status_code == 409
        delay.assert_not_called()

    def test_authorization_runs_before_the_policy(self):
        """A non-owner gets the masked 404, never a 409 that would confirm the document."""
        world = build_tenant_world(application_status="draft")
        document = build_document(application=world.application, document_type="result_slip")
        stranger = build_profile(role="student")
        response, delay = _post_extract(_client_for(stranger), document.id)
        assert response.status_code == 404
        assert response.json().get("code") != "OCR_NOT_ENABLED"
        delay.assert_not_called()

    def test_application_without_institution_answers_409(self):
        world = build_tenant_world(application_status="draft")
        opt_in_ocr(world.institution)
        world.application.institution_ref = None
        world.application.save(update_fields=["institution_ref"])
        document = build_document(application=world.application, document_type="result_slip")
        response, delay = _post_extract(_client_for(world.student), document.id)
        assert response.status_code == 409
        delay.assert_not_called()


@pytest.mark.django_db
class TestTaskRecheck:
    def test_task_exits_not_enabled_and_clears_pending(self):
        world = build_tenant_world(application_status="draft")
        document = build_document(application=world.application, document_type="result_slip")
        ApplicationDocument.objects.filter(id=document.id).update(extraction_state="pending")
        from apps.documents.tasks import extract_document_text_task

        with patch("apps.common.storage.MediaStorage") as storage:
            result = extract_document_text_task.run(str(document.id))
        assert result == {"status": "not_enabled", "document_id": str(document.id)}
        storage.assert_not_called()
        document.refresh_from_db()
        assert document.extraction_state is None
        assert document.extracted_text in (None, "")


# ---------------------------------------------------------------------------
# The opt-in command
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOptInCommand:
    def test_super_admin_reads_an_empty_list_by_default(self):
        response = _client_for(build_profile(role="super_admin")).get(OPT_IN_URL)
        assert response.status_code == 200
        assert response.json() == {"success": True, "data": {"institution_ids": []}}

    @pytest.mark.parametrize("method", ["get", "put"])
    def test_tenant_admin_without_platform_settings_manage_gets_a_non_revealing_403(self, method):
        world = build_tenant_world()
        opt_in_ocr(world.institution)
        client = _client_for(world.staff)
        if method == "get":
            response = client.get(OPT_IN_URL)
        else:
            response = client.put(OPT_IN_URL, {"institution_ids": []}, format="json")
        assert response.status_code == 403
        assert str(world.institution.id) not in response.content.decode()
        # The PUT changed nothing.
        assert ocr_policy.opted_in_institution_ids() == [str(world.institution.id)]

    def test_student_gets_403(self):
        response = _client_for(build_profile(role="student")).get(OPT_IN_URL)
        assert response.status_code == 403

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"institution_ids": "x"},
            {"institution_ids": ["not-a-uuid"]},
            {"institution_ids": [1]},
            {"institution_ids": [str(uuid.uuid4())]},
        ],
        ids=["missing", "not-list", "bad-uuid", "not-string", "unknown-institution"],
    )
    def test_invalid_body_writes_nothing(self, body):
        build_institution()
        response = _client_for(build_profile(role="super_admin")).put(OPT_IN_URL, body, format="json")
        assert response.status_code == 400
        payload = response.json()
        assert payload["code"] == "VALIDATION_ERROR"
        assert "institution_ids" in payload["details"]
        assert not Setting.objects.filter(key=KEY).exists()
        assert not AuditLog.objects.filter(action="settings.change").exists()

    def test_duplicates_are_rejected(self):
        institution = build_institution()
        build_institution()
        response = _client_for(build_profile(role="super_admin")).put(
            OPT_IN_URL, {"institution_ids": [str(institution.id), str(institution.id)]}, format="json"
        )
        assert response.status_code == 400
        assert not Setting.objects.filter(key=KEY).exists()

    def test_successful_put_writes_the_row_and_one_audit_event(self):
        first, second = build_institution(), build_institution()
        actor = build_profile(role="super_admin")
        client = _client_for(actor)
        opt_in_ocr(first)
        before = AuditLog.objects.filter(action="settings.change").count()

        response = client.put(OPT_IN_URL, {"institution_ids": [str(second.id)]}, format="json")

        assert response.status_code == 200, response.content
        assert response.json() == {"success": True, "data": {"institution_ids": [str(second.id)]}}
        setting = Setting.objects.get(key=KEY)
        assert setting.value == [str(second.id)]
        rows = AuditLog.objects.filter(action="settings.change")
        assert rows.count() == before + 1
        row = rows.order_by("-created_at").first()
        assert row.actor_id is not None
        assert str(row.actor_id) == str(actor.id)
        assert row.entity_type == "setting"
        assert str(row.entity_id) == str(setting.id)
        assert row.changes["key"] == KEY
        assert row.changes["actor_role"] == "super_admin"
        assert row.changes["before"] == [str(first.id)]
        assert row.changes["after"] == [str(second.id)]
        # The extract gate follows the new list.
        assert ocr_policy.is_ocr_enabled_for_institution(second.id) is True
        assert ocr_policy.is_ocr_enabled_for_institution(first.id) is False

    def test_first_put_creates_the_row(self):
        institution = build_institution()
        response = _client_for(build_profile(role="super_admin")).put(
            OPT_IN_URL, {"institution_ids": [str(institution.id)]}, format="json"
        )
        assert response.status_code == 200
        setting = Setting.objects.get(key=KEY)
        assert setting.category == "documents"
        assert setting.is_public is False


# ---------------------------------------------------------------------------
# The generic settings endpoints leave the key alone
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGenericSettingsLeaveTheKeyAlone:
    def _seed(self):
        institution = build_institution()
        opt_in_ocr(institution)
        return Setting.objects.get(key=KEY)

    def test_tenant_admin_list_read_does_not_contain_the_key(self):
        setting = self._seed()
        world = build_tenant_world()
        response = _client_for(world.staff).get("/api/v1/admin/settings/")
        assert response.status_code == 200
        text = response.content.decode()
        assert KEY not in text
        assert str(setting.id) not in text

    def test_super_admin_list_read_does_not_contain_the_key(self):
        self._seed()
        response = _client_for(build_profile(role="super_admin")).get("/api/v1/admin/settings/")
        assert response.status_code == 200
        assert KEY not in response.content.decode()

    def test_detail_read_answers_404(self):
        setting = self._seed()
        response = _client_for(build_profile(role="super_admin")).get(f"/api/v1/admin/settings/{setting.id}/")
        assert response.status_code == 404

    def test_create_patch_and_delete_answer_403_key_managed_elsewhere(self):
        setting = self._seed()
        client = _client_for(build_profile(role="super_admin"))
        create = client.post("/api/v1/admin/settings/", {"key": KEY, "value": []}, format="json")
        patch_ = client.patch(f"/api/v1/admin/settings/{setting.id}/", {"value": []}, format="json")
        delete = client.delete(f"/api/v1/admin/settings/{setting.id}/")
        for response in (create, patch_, delete):
            assert response.status_code == 403
            assert response.json()["code"] == "KEY_MANAGED_ELSEWHERE"
        setting.refresh_from_db()
        assert setting.value != []

    def test_import_reports_the_key_as_an_entry_error_and_writes_nothing_for_it(self):
        setting = self._seed()
        original = list(setting.value)
        response = _client_for(build_profile(role="super_admin")).post(
            "/api/v1/admin/settings/import/",
            {"settings": [{"key": KEY, "value": []}]},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert KEY not in data["imported"]
        assert any(KEY in error and "KEY_MANAGED_ELSEWHERE" in error for error in data["errors"])
        setting.refresh_from_db()
        assert setting.value == original

    def test_reset_keeps_the_row(self):
        setting = self._seed()
        original = list(setting.value)
        response = _client_for(build_profile(role="super_admin")).post("/api/v1/admin/settings/reset/")
        assert response.status_code == 200
        kept = Setting.objects.get(key=KEY)
        assert kept.id == setting.id
        assert kept.value == original
