"""Property-based invariants for the public tracking credential (task 10.5).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: R13.12, R2.4, R17.2, R17.7
Findings:     STU-22, TEN-10

These are **task invariants**, not numbered spec properties: task 10.5 has no
numbered property-based-testing sub-task, and no property is claimed against the
spec's property register. They exist because three of the security claims are
statements about *all* inputs rather than about examples, and an example-based
suite cannot express them:

* **T1 — classification is total, pure and mutually exclusive.** Every string maps
  to exactly one kind, and the mapping never reads the database. This is what makes
  "an application number is refused identically whether or not it exists" true by
  construction rather than by coincidence.
* **T2 — a secret round-trips, and any mutation of it does not.** Over the whole
  generated token space, `parse ∘ build` is the identity and a single-character
  change to the verifier never verifies.
* **T3 — the token alphabet is unambiguous.** No issued code can contain a
  character that can be misread as another (`I`/`L`/`O`/`U`).
* **T4 — normalisation is idempotent and case-insensitive** for the secret shape,
  so a code retyped in lower case resolves and a normalised code is stable.
* **T5 — the refusal vocabulary is closed.** Whatever a caller submits, the
  classification is one of the three published kinds — there is no fourth answer a
  future edit could smuggle in.

Framework: Hypothesis (the backend's property framework per the design).

**Validates: Requirements R13.12, R17.2**
"""

from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications import tracking_secret  # noqa: E402

_default = settings(max_examples=50, deadline=None)

_alphabet_char = st.sampled_from(tracking_secret.ALPHABET)


def _segment(length: int):
    return st.lists(_alphabet_char, min_size=length, max_size=length).map("".join)


_selector = _segment(tracking_secret.SELECTOR_LENGTH)
_verifier = _segment(tracking_secret.VERIFIER_LENGTH)
_secret = st.builds(tracking_secret.build_code, _selector, _verifier)

#: Application-number and legacy-tracking-code shapes — the identifiers that were
#: credentials before 10.5.
_institution_code = st.lists(
    st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"), min_size=2, max_size=10
).map("".join)
_application_number = st.builds(
    lambda code, digits: f"{code}{digits}",
    _institution_code,
    st.lists(st.sampled_from("0123456789"), min_size=9, max_size=14).map("".join),
)
_legacy_trk = st.builds(
    lambda body: f"TRK-{body}",
    st.lists(st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), min_size=12, max_size=12).map("".join),
)

_arbitrary = st.text(max_size=60)


class TestT1ClassificationIsTotalAndPure:
    """T1: exactly one kind per string, and never a database read."""

    @given(value=_arbitrary)
    @_default
    def test_every_string_has_exactly_one_kind(self, value):
        kind = tracking_secret.classify(value)
        assert kind in {
            tracking_secret.KIND_SECRET,
            tracking_secret.KIND_LEGACY,
            tracking_secret.KIND_UNRECOGNISED,
        }

    @given(value=_arbitrary)
    @_default
    def test_classification_is_deterministic(self, value):
        assert tracking_secret.classify(value) == tracking_secret.classify(value)

    @given(code=_secret)
    @_default
    def test_a_generated_secret_classifies_as_a_secret(self, code):
        assert tracking_secret.classify(code) == tracking_secret.KIND_SECRET

    @given(number=_application_number)
    @_default
    def test_an_application_number_never_classifies_as_a_secret(self, number):
        assert tracking_secret.classify(number) == tracking_secret.KIND_LEGACY

    @given(code=_legacy_trk)
    @_default
    def test_a_legacy_tracking_code_never_classifies_as_a_secret(self, code):
        assert tracking_secret.classify(code) == tracking_secret.KIND_LEGACY


class TestT2SecretRoundTrip:
    """T2: parse ∘ build is the identity; a mutated verifier never verifies."""

    @given(selector=_selector, verifier=_verifier)
    @_default
    def test_parse_inverts_build(self, selector, verifier):
        parsed = tracking_secret.parse(tracking_secret.build_code(selector, verifier))
        assert parsed == (selector, verifier)

    @given(verifier=_verifier)
    @_default
    def test_the_stored_hash_verifies_the_verifier(self, verifier):
        stored = tracking_secret.hash_verifier(verifier)
        assert tracking_secret.matches(stored, verifier) is True

    @given(verifier=_verifier, position=st.integers(min_value=0, max_value=19), replacement=_alphabet_char)
    @_default
    def test_a_single_character_change_never_verifies(self, verifier, position, replacement):
        assume(verifier[position] != replacement)
        mutated = verifier[:position] + replacement + verifier[position + 1 :]
        stored = tracking_secret.hash_verifier(verifier)
        assert tracking_secret.matches(stored, mutated) is False

    @given(verifier=_verifier)
    @_default
    def test_a_missing_stored_hash_never_verifies(self, verifier):
        assert tracking_secret.matches(None, verifier) is False
        assert tracking_secret.matches("", verifier) is False

    @given(verifier=_verifier)
    @_default
    def test_the_hash_is_a_sha256_hex_digest(self, verifier):
        digest = tracking_secret.hash_verifier(verifier)
        assert len(digest) == 64
        assert set(digest) <= set("0123456789abcdef")
        # …and it does not contain the plaintext.
        assert verifier.lower() not in digest


class TestT3AlphabetIsUnambiguous:
    @given(code=_secret)
    @_default
    def test_no_issued_code_contains_an_ambiguous_character(self, code):
        assert not (set("ILOU") & set(code.replace("TRK-", "")))

    @given(code=_secret)
    @_default
    def test_the_code_is_url_safe(self, code):
        from urllib.parse import quote

        assert quote(code, safe="") == code


class TestT4NormalisationIsStable:
    @given(code=_secret)
    @_default
    def test_normalisation_is_idempotent(self, code):
        once = tracking_secret.normalize(code)
        assert tracking_secret.normalize(once) == once

    @given(code=_secret)
    @_default
    def test_a_lower_case_code_still_parses(self, code):
        assert tracking_secret.parse(code.lower()) == tracking_secret.parse(code)

    @given(code=_secret, pad=st.sampled_from(["", " ", "  ", "\t", "\n"]))
    @_default
    def test_surrounding_whitespace_is_tolerated(self, code, pad):
        assert tracking_secret.parse(f"{pad}{code}{pad}") == tracking_secret.parse(code)


class TestT5RefusalVocabularyIsClosed:
    @given(value=_arbitrary)
    @_default
    def test_a_non_secret_never_parses(self, value):
        if tracking_secret.classify(value) != tracking_secret.KIND_SECRET:
            assert tracking_secret.parse(value) is None

    @given(value=_arbitrary)
    @_default
    def test_a_secret_always_parses(self, value):
        if tracking_secret.classify(value) == tracking_secret.KIND_SECRET:
            assert tracking_secret.parse(value) is not None
