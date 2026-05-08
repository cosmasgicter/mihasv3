"""Tests for API governance documentation."""
from pathlib import Path

DOCS = Path(__file__).resolve().parents[3] / "docs" / "api"


def test_versioning_doc_exists():
    path = DOCS / "VERSIONING.md"
    assert path.is_file()
    content = path.read_text()
    # Required sections
    assert "Versioning Strategy" in content
    assert "Response Envelope" in content
    assert "Non-Breaking Changes" in content
    assert "Breaking Changes" in content
    assert "Deprecation Process" in content
    assert "Baseline Management" in content


def test_versioning_doc_references_envelope_contract():
    content = (DOCS / "VERSIONING.md").read_text()
    assert '{"success": true, "data"' in content
    assert '{"success": false, "error"' in content


def test_versioning_doc_references_deprecation_headers():
    content = (DOCS / "VERSIONING.md").read_text()
    assert "RFC 9745" in content
    assert "RFC 8594" in content
    assert "Deprecation: true" in content
    assert "Sunset:" in content


def test_versioning_doc_minimum_deprecation_window():
    content = (DOCS / "VERSIONING.md").read_text()
    assert "3 months" in content
