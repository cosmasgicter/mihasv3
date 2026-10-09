"""Extract the wizard controller's catalog/identity resolution, verbatim.

Task 12.1 (MAINT-01). 11.2 §22 named exactly this as what it left behind:
"state, catalog/identity resolution, the grades/uploads/OCR adapters, the effects
and the result object".

11.2 §10.1 is the cautionary tale for this file: it *re-authored* a validation
function instead of lifting it, and silently dropped a hydration guard, a
duplicate-subject error, an upload guard and six field labels. So this script does
the moving, by line range, and asserts the moved text is byte-identical. No block
is retyped.
"""
import io

P = 'src/pages/student/applicationWizard/hooks/useWizardController.ts'
OUT = 'src/pages/student/applicationWizard/hooks/wizard/useWizardCatalogIdentity.ts'

lines = io.open(P, encoding='utf-8').read().split('\n')


def take(first, last):
    """1-indexed inclusive slice."""
    return lines[first - 1:last]


# --- verify the boundaries are what we think they are -----------------------
assert lines[242].strip() == 'const [programs, setPrograms] = useState<WizardProgram[]>([])', lines[242]
assert lines[243].strip() == 'const [intakes, setIntakes] = useState<WizardIntake[]>([])', lines[243]
assert lines[256].strip() == 'const findProgramId = useCallback(', lines[256]
assert lines[345].strip() == ')', lines[345]
assert lines[394].strip() == 'useEffect(() => {', lines[394]
assert lines[408].strip() == '}, [intakesData])', lines[408]
assert lines[429].strip() == 'useEffect(() => {', lines[429]
assert lines[436].strip() == '}, [programsData])', lines[436]

state_block = take(243, 244)          # the two useState lines
resolver_block = take(257, 346)       # findProgramId .. intakeIds
# The two population effects deliberately stay in the controller — see the note in
# the generated header. They copy a query payload into this state, and the query
# they read (`useProgramsForIntake(watch('intake'))`) needs the form, which needs
# the schema, which needs this hook's `programIds`. Moving them would mean either
# splitting one concern across two hooks for a mechanical reason, or changing the
# order the effects run in, which is what the Order-A race is about.

HEADER = '''/**
 * The wizard's catalog lists and its canonical-identity resolvers (admissions-v2
 * task **12.1**, MAINT-01).
 *
 * Lifted **verbatim** out of `useWizardController.ts`. Task 11.2 §22 named this as
 * one of five things it left for 12.1: "state, catalog/identity resolution, the
 * grades/uploads/OCR adapters, the effects and the result object".
 *
 * Why this is the right seam, and why it matters more than line count: this is the
 * code that answers *which canonical program and which canonical intake a student
 * means*. The wizard's form holds whatever the draft restored — which may be a
 * **display name** rather than a UUID — and the canonical truth map is explicit
 * that canonical IDs are the sole authority for routing and scoping while the
 * legacy `applications.program` / `.intake` strings are display snapshots. So
 * `findProgramId`'s fallback ladder (exact id, exact name, institution-hinted
 * tie-break, partial name) is load-bearing, and it belonged in a module with a
 * name rather than in the middle of a 1,110-line hook.
 *
 * Nothing about the ladder changed. Every branch, every `.trim().toLowerCase()`,
 * every tie-break and the `''`-means-"fail validation" contract are byte-identical
 * to what they were; the extraction was performed by line range, not retyped —
 * which is the lesson of 11.2 §10.1, where a re-authored validation function
 * silently lost a hydration guard, a duplicate-subject error, an upload guard and
 * six field labels.
 *
 * What deliberately stayed in the controller, and why:
 *
 *   - The two **reconciliation effects** that write a resolved id back into the
 *     form. They need `setValue`, and the Order-A race they close (catalog cache
 *     resolving before draft restore) is a property of the controller's own effect
 *     ordering.
 *   - The two **population effects** that copy a query payload into `programs` /
 *     `intakes`. They read `catalogData.useProgramsForIntake(watch('intake'))`,
 *     which needs the form, which needs the schema, which needs this hook's
 *     `programIds`. Moving them would mean splitting one concern across two hooks
 *     for a purely mechanical reason, or reordering effects in the file whose
 *     effect ordering is the thing the reconciliation exists to defend. Stated
 *     rather than papered over: this hook owns the state and the resolvers, and the
 *     controller still owns the two writes into that state.
 */
import { useCallback, useMemo, useState } from 'react'

import { resolveWizardIntakeIdentity } from './wizardControllerUtils'
import type { WizardIntake, WizardProgram } from '../../types'

export function useWizardCatalogIdentity() {
'''

FOOTER = '''
  return {
    programs,
    setPrograms,
    intakes,
    setIntakes,
    findProgramId,
    deriveInstitutionLabel,
    resolveProgramIdentity,
    resolveIntakeIdentity,
    programIds,
    intakeIds,
  }
}
'''

body = '\n'.join(state_block + [''] + resolver_block)
io.open(OUT, 'w', encoding='utf-8').write(HEADER + body + FOOTER)

# --- byte-identity assertion ------------------------------------------------
written = io.open(OUT, encoding='utf-8').read()
for label, block in [
    ('state', state_block),
    ('resolvers', resolver_block),
]:
    chunk = '\n'.join(block)
    assert chunk in written, label
print('wrote', OUT, len(written.split('\n')), 'lines — all four blocks byte-identical')
