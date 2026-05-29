"""Import smoke tests — regression guard for the ImportError fixed in May 2026."""


def test_extract_document_text_task_importable():
    from apps.documents.tasks import extract_document_text_task
    assert callable(extract_document_text_task)


def test_get_document_storage_key_callable():
    from apps.common.storage import get_document_storage_key
    assert callable(get_document_storage_key)


def test_legacy_alias_reexported_from_views():
    from apps.documents.views import _get_document_storage_key
    assert callable(_get_document_storage_key)
