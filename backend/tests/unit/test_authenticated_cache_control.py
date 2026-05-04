"""Tests for authenticated API no-store cache headers."""

from django.http import HttpRequest, HttpResponse
from django.test import SimpleTestCase

from apps.common.middleware import SecurityHeadersMiddleware


class AuthenticatedCacheControlTests(SimpleTestCase):
    def _response_for(self, request):
        middleware = SecurityHeadersMiddleware(lambda _request: HttpResponse(status=200))
        return middleware(request)

    def test_bearer_api_request_gets_no_store(self):
        request = HttpRequest()
        request.path = "/api/v1/applications/"
        request.META["HTTP_AUTHORIZATION"] = "Bearer token"

        response = self._response_for(request)

        self.assertEqual(response["Cache-Control"], "no-store, no-cache, must-revalidate, private")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["Expires"], "0")

    def test_auth_cookie_api_request_gets_no_store(self):
        request = HttpRequest()
        request.path = "/api/v1/applications/"
        request.COOKIES["access_token"] = "token"

        response = self._response_for(request)

        self.assertEqual(response["Cache-Control"], "no-store, no-cache, must-revalidate, private")
