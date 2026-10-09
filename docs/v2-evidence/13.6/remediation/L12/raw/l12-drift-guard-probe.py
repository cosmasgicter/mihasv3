"""L12 verification: the drift guard's own invariant, evaluated without a database.

backend/tests/unit/test_compatibility_surfaces_12_2.py::
test_frontend_register_windows_match_the_canonical_register reads
LEGACY_EXCEPTION_REMOVE_BY out of architectureEnforcement.test.ts and compares it with
COMPATIBILITY_SURFACES['catalog.legacy_institution_write'].end_date.

L12 emptied LEGACY_EXCEPTIONS in that file. This checks the constant the guard reads
survived that edit. The pytest run itself cannot be used here: backend/tests/conftest.py
needs a Postgres connection, and this task is frontend-only and forbidden from touching
any database. compatibility_register.py imports only stdlib, so it loads standalone.
"""
import importlib.util, pathlib, re, sys

ROOT = pathlib.Path("/home/cosmas/Downloads/mihasv3")
spec = importlib.util.spec_from_file_location(
    "compatibility_register", ROOT / "backend/apps/common/compatibility_register.py"
)
mod = importlib.util.module_from_spec(spec)
sys.modules["compatibility_register"] = mod
spec.loader.exec_module(mod)

expected = mod.COMPATIBILITY_SURFACES["catalog.legacy_institution_write"].end_date
print(f"canonical register end_date                     = {expected}")
print(f"  (ANNOUNCED_ON={mod.ANNOUNCED_ON} + {mod.COMPATIBILITY_WINDOW_DAYS} days)")

ok = True
for rel, const in (
    ("apps/admissions/tests/unit/architectureEnforcement.test.ts", "LEGACY_EXCEPTION_REMOVE_BY"),
    ("apps/admissions/tests/unit/documentFlowDriftGuard.test.ts", "PREVIEW_ALLOWLIST_REMOVE_BY"),
):
    src = (ROOT / rel).read_text(encoding="utf-8")
    m = re.search(rf"^const {re.escape(const)} = '([^']+)'", src, re.M)
    got = m.group(1) if m else None
    match = got == expected
    ok &= match
    print(f"{'OK  ' if match else 'FAIL'} {const:<28} = {got!r}   ({rel})")

# The other half L12 must not have broken: the register is empty, and the owner constant
# is still declared.
arch = (ROOT / "apps/admissions/tests/unit/architectureEnforcement.test.ts").read_text()
owner = re.search(r"^const LEGACY_EXCEPTION_OWNER = '([^']+)'", arch, re.M)
entries = re.search(
    r"const LEGACY_EXCEPTIONS: readonly LegacyException\[\] = \[(.*?)\n\]", arch, re.S
)
body = entries.group(1) if entries else ""
live = [l for l in body.splitlines() if l.strip() and not l.strip().startswith("//")]
print(f"OK   LEGACY_EXCEPTION_OWNER          = {owner.group(1)!r}" if owner else "FAIL owner missing")
print(f"{'OK  ' if not live else 'FAIL'} LEGACY_EXCEPTIONS live entries   = {len(live)}  (L12 target: 0)")
ok &= bool(owner) and not live
print("\nRESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
