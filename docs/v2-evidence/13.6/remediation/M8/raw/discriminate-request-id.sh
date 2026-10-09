#!/usr/bin/env bash
# M8 discrimination instrument: prove the ``request_id`` exclusion is not a
# weakening. Remove the exclusion -> the intended cases fail; restore -> pass.
# Then make the correlation id CONSTANT -> the new per-request assertion fails,
# which is what makes the exclusion sound rather than convenient.
#
# Run from backend/ with .venv active and .localtest-host-env.sh sourced.
set -u
P=tests/property/test_production_scope_masking_properties.py
Q=tests/unit/test_admissions_v2_authority_policies.py
SEL_Q="$Q::TestCapabilityDerivedEndpointAuthority::test_student_staff_mutation_is_masked_as_not_found"
RUN() { python3 -m pytest -q -p no:cacheprovider -p no:randomly "$@" 2>&1 | grep -E "^(FAILED|ERROR|[0-9]+ (passed|failed))|passed|failed" | tail -6; }

cp "$P" /tmp/m8-p26.bak
cp "$Q" /tmp/m8-pol.bak

echo "=== DISCRIMINATION: the request_id exclusion is not a weakening ==="
echo
echo "-- step 1: shipped state (exclusion present) --"
RUN "$P" "$SEL_Q"

echo
echo "-- step 2: exclusion REMOVED in both files, nothing else changed --"
python3 - "$P" "$Q" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old = '        body = {key: value for key, value in body.items() if key != "request_id"}'
assert t.count(old) == 1, t.count(old)
p.write_text(t.replace(old, '        body = dict(body)  # DISCRIMINATION PROBE'))
q = pathlib.Path(sys.argv[2]); s = q.read_text()
old2 = '            return {k: v for k, v in payload.items() if k != "request_id"}'
assert s.count(old2) == 1, s.count(old2)
q.write_text(s.replace(old2, '            return dict(payload)  # DISCRIMINATION PROBE'))
print("probe applied to both files")
PY
RUN "$P" "$SEL_Q"

echo
echo "-- step 3: restored --"
cp /tmp/m8-p26.bak "$P"; cp /tmp/m8-pol.bak "$Q"
RUN "$P" "$SEL_Q"

echo
echo "-- step 4: correlation id forced CONSTANT -> the per-request assertion must fail --"
python3 - "$P" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old = '    return body.get("request_id") if isinstance(body, dict) else None'
assert t.count(old) == 1, t.count(old)
p.write_text(t.replace(old, '    return "CONSTANT-PROBE" if isinstance(body, dict) and body.get("request_id") else None'))
print("constant-id probe applied")
PY
RUN "$P"

echo
echo "-- step 5: restored, byte-identical --"
cp /tmp/m8-p26.bak "$P"
RUN "$P" "$SEL_Q"
md5sum "$P" /tmp/m8-p26.bak "$Q" /tmp/m8-pol.bak
