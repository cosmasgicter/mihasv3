"""R8 exploration: local phone formats register; messages never echo input.

Spec: student-journey-repair task 1.8, clause 1.39 (design R8-b, backend half).

At HEAD ``validate_zambian_phone`` accepts only ``+260XXXXXXXXX``, so a student
typing the number the way it is printed on a SIM pack (``0971234567``) cannot
register, and both it and ``validate_nrc`` put the submitted value into the
message, which the API returns and the UI renders.

All numbers and NRCs below are fictional.
"""
from __future__ import annotations

import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import Profile
from apps.common.validators import validate_nrc, validate_zambian_phone

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.mark.parametrize(
    "typed,stored",
    [("0971234567", "+260971234567"), ("0761234567", "+260761234567")],
)
def test_local_formats_register_and_are_stored_in_e164(typed, stored):
    email = f"phone-{typed}@example.test"
    response = APIClient().post(
        "/api/v1/auth/register/",
        {
            "email": email,
            "password": "Passw0rd-local",
            "first_name": "Phone",
            "last_name": "Student",
            "phone": typed,
        },
        format="json",
    )

    # HEAD: 400 with details.phone "0971234567 is not a valid Zambian phone number".
    assert response.status_code in (200, 201), response.content
    assert Profile.objects.get(email__iexact=email).phone == stored


@pytest.mark.parametrize(
    "validator,value",
    [
        (validate_zambian_phone, "12345"),
        (validate_zambian_phone, "+26097123"),
        (validate_nrc, "99999/99/9"),
        (validate_nrc, "abcdef/gh/i"),
    ],
)
def test_validation_messages_never_contain_the_input(validator, value):
    with pytest.raises(ValidationError) as excinfo:
        validator(value)

    messages = " ".join(excinfo.value.messages)
    assert value not in messages
