from django.test import SimpleTestCase

from apps.common.email_templates import get_base_email_html


class TestPremiumEmailTemplate(SimpleTestCase):
    def test_wraps_content_in_premium_shell(self):
        html = get_base_email_html("<p>Hello applicant</p>", title="Offer Update")

        self.assertIn("Beanola Admissions", html)
        self.assertIn("Beanola Technologies Admissions Platform", html)
        self.assertIn("Offer Update", html)
        self.assertIn("Please do not reply directly to this email", html)
        self.assertIn("<p>Hello applicant</p>", html)
