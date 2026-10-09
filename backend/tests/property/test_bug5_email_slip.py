"""Property 9: an application slip email has exactly one route, and it is wired.

── History ─────────────────────────────────────────────────────────────────
This suite began as a bug-condition exploration test for a real defect: the
client asked to email an application slip, no backend route existed, and the
client returned a hardcoded "not implemented" refusal. The fix registered
``POST /api/v1/applications/{id}/email-slip/``, and these cases pinned it.

admissions-v2 task **10.4** (R13.5, R13.11, finding **API-04**) then built the
canonical official-document family — ``POST …/official-documents/{type}/email/``,
the only path with stored provenance, a fingerprint, a durable job and a delivery
record in the communications history — and reduced ``/email-slip/`` to a proxy
over it for the measured deprecation window R13.5 requires. Task **10.6** closed
that window: zero production call sites, measured twice
(``docs/v2-evidence/10.4/README.md`` §8 and
``docs/v2-evidence/10.6/raw/usage-measurement.txt``), and the route is removed.

── What the property is now ─────────────────────────────────────────────────
Property 9 was never "the path ``email-slip`` is in the URL conf". It was
**a capability with no route behind it**, surfacing to the student as a hardcoded
lie. So the property is asserted against the route that now carries the
capability, plus its converse — that there is no *second* route for it, which is
the finding (API-04) the consolidation closes.

**Validates: Requirements 1.10, 1.11**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402,F401

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.urls import NoReverseMatch, resolve, reverse  # noqa: E402
from django.urls.exceptions import Resolver404  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_emails = st.from_regex(r"[a-z]{3,10}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True)
_app_ids = st.uuids()


# =========================================================================
# Property 9a: the capability has a route
# =========================================================================


class TestOfficialDocumentEmailEndpointExists(SimpleTestCase):
    """For any valid application UUID, the canonical slip-email route resolves.

    This is the original property, carried by the route that now owns the
    capability. If it ever stops resolving, "email me my slip" is a dead end
    again — which is the defect, independent of which URL served it.

    **Validates: Requirements 1.10, 1.11**
    """

    @given(app_id=_app_ids)
    @settings(max_examples=5, deadline=None)
    def test_canonical_email_url_resolves(self, app_id):
        try:
            url = reverse(
                "applications:application-official-document-email",
                kwargs={"application_id": app_id, "document_type": "application_slip"},
            )
        except NoReverseMatch:
            self.fail(
                "URL pattern 'application-official-document-email' does not exist. "
                "Bug condition: no endpoint can email an application slip."
            )
        self.assertIn("official-documents/application_slip/email/", url)
        self.assertIn(str(app_id), url)

    @given(app_id=_app_ids)
    @settings(max_examples=5, deadline=None)
    def test_canonical_email_path_resolves_to_a_view(self, app_id):
        url_path = (
            f"/api/v1/applications/{app_id}"
            "/official-documents/application_slip/email/"
        )
        try:
            match = resolve(url_path)
        except Resolver404:
            self.fail(
                f"URL path '{url_path}' does not resolve. "
                "Bug condition: the slip-email capability has no route."
            )
        self.assertIsNotNone(match.func)

    @given(email=_emails)
    @settings(max_examples=5, deadline=None)
    def test_the_view_is_importable(self, email):
        """The view backing the capability must exist as a real class."""
        self.assertTrue(email)
        try:
            from apps.applications.official_document_views import (  # noqa: F401
                OfficialDocumentEmailView,
            )
        except (ImportError, AttributeError):
            self.fail(
                "OfficialDocumentEmailView cannot be imported. "
                "Bug condition: the slip-email capability has no implementation."
            )

    @given(email=_emails)
    @settings(max_examples=5, deadline=None)
    def test_the_url_conf_wires_the_view(self, email):
        """A view nobody routed to is the same defect as no view at all."""
        import inspect

        from apps.applications import urls as app_urls

        self.assertTrue(email)
        source = inspect.getsource(app_urls)
        self.assertIn(
            "OfficialDocumentEmailView",
            source,
            "OfficialDocumentEmailView is not wired in apps/applications/urls.py.",
        )


# =========================================================================
# Property 9b: and only one route (API-04)
# =========================================================================


class TestThereIsOnlyOneSlipEmailRoute(SimpleTestCase):
    """The retired duplicate is gone (task 10.6, R13.5, finding API-04).

    Two routes for one capability is the finding, not a convenience: the deleted
    one bypassed the delivery gate, so its messages appeared in no communications
    history and reported an ``unknown`` delivery state, and it emailed to whatever
    address the request body named.

    **Validates: Requirements 1.10, 1.11**
    """

    @given(app_id=_app_ids)
    @settings(max_examples=5, deadline=None)
    def test_the_retired_route_name_does_not_reverse(self, app_id):
        with self.assertRaises(NoReverseMatch):
            reverse(
                "applications:application-email-slip",
                kwargs={"application_id": app_id},
            )

    @given(app_id=_app_ids)
    @settings(max_examples=5, deadline=None)
    def test_the_retired_path_does_not_resolve(self, app_id):
        with self.assertRaises(Resolver404):
            resolve(f"/api/v1/applications/{app_id}/email-slip/")

    def test_the_url_conf_no_longer_mentions_the_retired_view(self):
        import inspect

        from apps.applications import urls as app_urls

        source = inspect.getsource(app_urls)
        # The removal is documented in a comment, so the check is for the wiring
        # (`EmailSlipView.as_view`) rather than for the name appearing at all.
        self.assertNotIn("EmailSlipView.as_view", source)
