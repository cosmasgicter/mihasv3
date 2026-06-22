"""Property-based test for the launch-verification secret-redaction helper.

# Feature: beanola-launch-verification, Property 16: Evidence artifacts never contain a secret value (redaction)

Property 16: *For any* captured command output or configuration containing
secret-shaped tokens (connection strings, passwords, API keys, raw phone
numbers, NRC/passport values, JWTs, document bodies), the emitted
Evidence_Artifact -- including the failure path -- contains only
credential/setting **names** and present/absent indicators, and contains
**none** of the secret values as a substring.

The pin: for any structure built by embedding generated secret-shaped values
into dicts/lists/strings at arbitrary nesting depths and arbitrary
(non-sensitive) dict keys/string contexts, after passing through
``redact``/``redact_obj``/``redact_text`` the serialized output
(``json.dumps``) MUST NOT contain the embedded secret literal as a substring.
A companion property pins preservation: non-secret scalars (DEBUG flags, plain
names, integers, ``None``) survive redaction unchanged.

This exercises the pure helper ``apps.common.launch_verification.redaction``
(standard-library only, no Django, no ORM, no I/O).

Backend property-test conventions (spec ``beanola-launch-verification``):
- ``pytest`` + ``hypothesis``, >= 100 examples, exactly one property per test
  method, tagged with the Feature/Property marker above.

**Validates: Requirements 1.9, 9.4, 9.9**
"""

from __future__ import annotations

import json
import string

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

from apps.common.launch_verification.redaction import (
    REDACTION_MARKER,
    redact,
    redact_obj,
    redact_text,
)

# Run a meaningful campaign: >= 100 examples per property (Property 16 pin).
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# Alphanumerics used to build secret bodies that the redaction regexes consume
# wholesale (no whitespace/quote/angle-bracket so the match never truncates).
_ALNUM = string.ascii_letters + string.digits
_DIGITS = string.digits

# Dict keys that are deliberately NON-sensitive: they do not contain any of the
# secret/PII/body markers, so redaction must catch the secret via the *text*
# scrubbing path (redact_text), not the wholesale sensitive-key path. This is
# the harder, more meaningful half of the property.
_SAFE_KEYS = st.sampled_from(
    [
        "summary",
        "detail",
        "output",
        "note",
        "line",
        "message",
        "label",
        "section",
        "entry",
        "item",
        "gate",
        "step",
        "col0",
        "col1",
        "observed",
    ]
)


# ---------------------------------------------------------------------------
# Secret-shaped value strategies. Each produces a string that the redaction
# helper redacts *wholesale* (the entire token is replaced by the marker), so
# the generated literal must not survive anywhere in the serialized output.
# ---------------------------------------------------------------------------


@st.composite
def _alnum(draw, min_size: int, max_size: int) -> str:
    return draw(
        st.text(alphabet=_ALNUM, min_size=min_size, max_size=max_size)
    )


@st.composite
def connection_strings(draw) -> str:
    scheme = draw(
        st.sampled_from(
            ["postgres", "postgresql", "redis", "rediss", "amqp", "mongodb", "mysql"]
        )
    )
    user = draw(_alnum(1, 12))
    pwd = draw(_alnum(1, 24))
    host = draw(_alnum(1, 12))
    port = draw(st.integers(min_value=1, max_value=65535))
    db = draw(_alnum(0, 12))
    return f"{scheme}://{user}:{pwd}@{host}.internal:{port}/{db}"


@st.composite
def credentialed_uris(draw) -> str:
    scheme = draw(st.sampled_from(["smtp", "smtps", "https", "amqps", "mssql"]))
    user = draw(_alnum(1, 12))
    pwd = draw(_alnum(1, 24))
    host = draw(_alnum(1, 12))
    return f"{scheme}://{user}:{pwd}@{host}.example.net/path"


@st.composite
def jwts(draw) -> str:
    header = draw(_alnum(1, 20))
    payload = draw(_alnum(1, 40))
    sig = draw(_alnum(1, 40))
    return f"eyJ{header}.{payload}.{sig}"


@st.composite
def prefixed_keys(draw) -> str:
    prefix = draw(st.sampled_from(["sk", "pk", "rk", "whsec", "api", "key"]))
    body = draw(_alnum(8, 48))
    return f"{prefix}_{body}"


@st.composite
def google_keys(draw) -> str:
    body = draw(
        st.text(alphabet=_ALNUM + "_-", min_size=16, max_size=48)
    )
    return f"AIza{body}"


@st.composite
def data_uris(draw) -> str:
    media = draw(st.sampled_from(["image/png", "application/pdf", "image/jpeg"]))
    blob = draw(
        st.text(alphabet=_ALNUM + "+/", min_size=8, max_size=64)
    )
    pad = draw(st.sampled_from(["", "=", "=="]))
    return f"data:{media};base64,{blob}{pad}"


@st.composite
def long_blobs(draw) -> str:
    return draw(st.text(alphabet=_ALNUM + "+/", min_size=200, max_size=400))


@st.composite
def zambian_phones(draw) -> str:
    nine = draw(st.text(alphabet=_DIGITS, min_size=9, max_size=9))
    shape = draw(st.sampled_from(["+260", "260", "0"]))
    return f"{shape}{nine}"


@st.composite
def nrc_numbers(draw) -> str:
    a = draw(st.text(alphabet=_DIGITS, min_size=6, max_size=6))
    b = draw(st.text(alphabet=_DIGITS, min_size=2, max_size=2))
    c = draw(st.text(alphabet=_DIGITS, min_size=1, max_size=1))
    return f"{a}/{b}/{c}"


@st.composite
def passports(draw) -> str:
    letters = draw(
        st.text(alphabet=string.ascii_uppercase, min_size=1, max_size=2)
    )
    digits = draw(st.text(alphabet=_DIGITS, min_size=6, max_size=9))
    return f"{letters}{digits}"


def secret_values() -> st.SearchStrategy[str]:
    """Any single secret-shaped token that the helper redacts wholesale."""
    return st.one_of(
        connection_strings(),
        credentialed_uris(),
        jwts(),
        prefixed_keys(),
        google_keys(),
        data_uris(),
        long_blobs(),
        zambian_phones(),
        nrc_numbers(),
        passports(),
    )


# Surrounding "innocent" text used to wrap a secret inside a string context.
# Restricted to letters + spaces so it can never itself form a secret shape and
# the space padding preserves the phone/NRC/passport regex boundaries.
_SAFE_TEXT = st.text(alphabet=string.ascii_letters + " ", max_size=16)


# Innocent noise scalars mixed alongside the secret-bearing leaves.
_NOISE = st.one_of(
    st.integers(),
    st.booleans(),
    st.none(),
    st.text(alphabet=string.ascii_letters, max_size=10),
)


def _embed(secret: str) -> st.SearchStrategy:
    """Build dict/list/string structures that always embed ``secret``.

    The recursive base is the secret-bearing leaf and every recursive
    extension is built from ``children`` (which carry the secret), so the
    generated structure is guaranteed to contain the secret at some depth,
    optionally surrounded by innocent noise siblings.
    """
    leaf = st.one_of(
        st.just(secret),
        st.builds(lambda pre, post: f"{pre} {secret} {post}", _SAFE_TEXT, _SAFE_TEXT),
    )
    return st.recursive(
        leaf,
        lambda children: st.one_of(
            st.lists(children, min_size=1, max_size=3),
            st.dictionaries(_SAFE_KEYS, children, min_size=1, max_size=3),
            # secret-bearing child alongside a noise sibling
            st.builds(lambda c, n: [c, n], children, _NOISE),
            st.builds(
                lambda c, n, k: {"primary": c, k: n}, children, _NOISE, _SAFE_KEYS
            ),
        ),
        max_leaves=6,
    )


# ---------------------------------------------------------------------------
# Property 16 — absence of any secret value in the redacted, serialized output.
# ---------------------------------------------------------------------------


class TestProperty16RedactionRemovesSecrets:
    """Feature: beanola-launch-verification, Property 16: Evidence artifacts never contain a secret value (redaction)."""

    @PBT_SETTINGS
    @given(data=st.data())
    def test_embedded_secret_never_survives_redaction(self, data) -> None:
        """A secret embedded at any depth/context is absent after redact_obj."""
        secret = data.draw(secret_values())
        obj = data.draw(_embed(secret))

        redacted = redact_obj(obj)
        serialized = json.dumps(redacted)

        assert secret not in serialized, (
            f"secret value leaked into redacted artifact: {secret!r}"
        )
        # The redaction marker is the only thing standing in for the secret.
        assert REDACTION_MARKER in serialized

    @PBT_SETTINGS
    @given(secret=secret_values(), pre=_SAFE_TEXT, post=_SAFE_TEXT)
    def test_secret_in_string_context_is_scrubbed(self, secret, pre, post) -> None:
        """redact_text scrubs a secret embedded in a free-form string."""
        text = f"{pre} value={secret} {post}"
        scrubbed = redact_text(text)
        assert secret not in scrubbed

    @PBT_SETTINGS
    @given(secret=secret_values())
    def test_redact_dispatch_string_scrubs_secret(self, secret) -> None:
        """The top-level redact() dispatch scrubs a bare secret string."""
        assert secret not in str(redact(secret))

    @PBT_SETTINGS
    @given(data=st.data())
    def test_secret_under_sensitive_key_is_removed(self, data) -> None:
        """A secret stored under a sensitive key is replaced wholesale."""
        secret = data.draw(secret_values())
        sensitive_key = data.draw(
            st.sampled_from(
                [
                    "password",
                    "api_key",
                    "secret_key",
                    "database_url",
                    "authorization",
                    "phone",
                    "nrc",
                    "passport",
                    "lenco_api_secret_key",
                ]
            )
        )
        obj = {sensitive_key: secret, "summary": "ok"}
        redacted = redact_obj(obj)
        assert redacted[sensitive_key] == REDACTION_MARKER
        assert secret not in json.dumps(redacted)

    @PBT_SETTINGS
    @given(
        name=st.sampled_from(
            [
                "DATABASE_URL",
                "SECRET_KEY",
                "LENCO_API_SECRET_KEY",
                "REDIS_URL",
                "AI_GATEWAY_API_KEY",
            ]
        ),
        value=secret_values(),
    )
    def test_env_assignment_keeps_name_drops_value(self, name, value) -> None:
        """Failure-path: an env-style NAME=value keeps the name, drops the value."""
        line = f"{name}={value}"
        scrubbed = redact_text(line)
        # Setting name is preserved (names are not secret) ...
        assert name in scrubbed
        # ... but the secret value itself is gone.
        assert value not in scrubbed
        assert REDACTION_MARKER in scrubbed


# ---------------------------------------------------------------------------
# Companion property — non-secret scalars are preserved (no over-zealous loss).
# ---------------------------------------------------------------------------


class TestProperty16PreservesNonSecrets:
    """Feature: beanola-launch-verification, Property 16: Evidence artifacts never contain a secret value (redaction)."""

    @PBT_SETTINGS
    @given(
        debug=st.booleans(),
        count=st.integers(min_value=-1000, max_value=1000),
        ratio=st.floats(allow_nan=False, allow_infinity=False, width=32),
        name=st.text(alphabet=string.ascii_letters, min_size=1, max_size=20),
    )
    def test_non_secret_scalars_are_preserved(self, debug, count, ratio, name) -> None:
        """DEBUG flags, ints, floats, plain names, and None survive unchanged."""
        obj = {
            "DEBUG": debug,
            "count": count,
            "ratio": ratio,
            "display_name": name,
            "missing": None,
        }
        redacted = redact_obj(obj)
        assert redacted["DEBUG"] is debug
        assert redacted["count"] == count
        assert redacted["ratio"] == ratio
        assert redacted["display_name"] == name
        assert redacted["missing"] is None
