/**
 * Acceptance-letter profiles — the authoritative per-institution banking and
 * per-programme fee/requirement data transcribed VERBATIM from the three
 * official sample letters supplied by the institutions:
 *
 *   • MIHAS — Diploma in Registered Nursing (RN), full time  (mihasacceptance.pdf)
 *   • KATC  — Diploma in Clinical Medicine (COG), full time   (katc cog acceptance.docx)
 *   • KATC  — Diploma in Environmental Health (EHT), distance  (katc eht acceptance.docx)
 *
 * EVERYTHING here is reproduced exactly from those documents — bank names,
 * account numbers, branch codes, swift/sort codes, fee amounts, and
 * requirement lists. These values are operationally and legally significant;
 * do not alter them without an updated official letter to match.
 *
 * Year handling: the institutions run TWO intakes a year (July and January).
 * Profiles therefore store NO hard-coded year. The REF title, academic-year
 * clause, reporting date, and commitment deadline are composed at render time
 * from the resolved intake (see `intakeSchedule.ts`) so a letter generated for
 * a July 2027 or January 2028 intake reads correctly.
 *
 * The K1,000 commitment fee is the non-refundable deposit the student pays
 * into the school's TUITION account to secure their place. It is treated as
 * part-payment toward tuition and is distinct from the in-app Lenco
 * application fee.
 */

/** A fee-chart row. Amounts are numeric ZMW so totals can be computed. */
export interface FeeChartRow {
  /** Fee item, e.g. "Tuition fees". */
  item: string
  /** Amount in ZMW. Negative for deductions (e.g. a bursary). */
  amount: number
  /** Optional cadence note, e.g. "Per semester", "Once off". */
  cadence?: string
  /** Where the amount is paid — account number or "Cash payment". */
  account?: string
  /**
   * Row kind controls styling + total maths:
   *   'charge'    — a payable item (default), included in the mandatory total.
   *   'deduction' — a reduction such as a bursary (negative amount).
   *   'subtotal'  — an emphasised computed line (e.g. net tuition payable).
   */
  kind?: 'charge' | 'deduction' | 'subtotal'
  /**
   * Optional / conditional item (e.g. monthly accommodation, per-year fees).
   * Rendered visually distinct and EXCLUDED from the mandatory intake total.
   */
  optional?: boolean
  /** Render the row emphasised (bold). */
  emphasis?: boolean
  /**
   * Whether this row contributes to the computed mandatory intake total.
   * Defaults to true for 'charge'/'subtotal' rows and false otherwise. Set
   * explicitly to false on the pre-deduction gross line when a 'subtotal'
   * row already nets it, so the amount is not double-counted.
   */
  inTotal?: boolean
}

export interface BankAccount {
  /** Human label for the account, e.g. "Tuition fees". */
  label: string
  accountName: string
  bankName: string
  accountNumber: string
  branchName: string
  branchCode: string
  swiftCode: string
  sortCode: string
}

export interface AcceptanceProfile {
  /** Resolved institution short code. */
  institutionCode: 'MIHAS' | 'KATC'
  /** Programme short code shown in the REF line, e.g. "RN", "COG", "EHT". */
  programCode: string
  /** Study mode, e.g. "Full Time", "Distance". */
  studyMode: string
  /**
   * Programme portion of the REF title, UPPERCASE, e.g.
   * "DIPLOMA IN REGISTERED NURSING (RN)". The full REF line — including the
   * intake month/year and study mode — is composed at render time.
   */
  refProgramTitle: string
  /** Programme display name, e.g. "Diploma in Registered Nursing". */
  programDisplayName: string
  /**
   * The "your application to study … was successful" descriptor phrase,
   * e.g. "Diploma in Registered Nursing full time".
   */
  studyDescriptor: string
  /**
   * Day + month of the reporting date WITHOUT a year, e.g. "6th July". The
   * intake year is appended at render time. Optional — when absent the letter
   * uses a relative instruction.
   */
  reportingDayMonth?: string
  /**
   * Day + month of the commitment-fee deadline WITHOUT a year, e.g. "9th May".
   * The intake year is appended at render time. Optional.
   */
  commitmentDeadlineDayMonth?: string
  /** The TUITION bank account the K1,000 commitment + tuition is paid into. */
  tuitionAccount: BankAccount
  /** Optional second account block (e.g. MIHAS "other fees" account). */
  otherFeesAccount?: BankAccount
  /** Fee chart rows reproduced from the sample. */
  feeChart: FeeChartRow[]
  /** Free-form notes reproduced from the sample (bursary, GNC breakdown, late penalty, etc). */
  notes: string[]
  /** Items the prospective student must bring. */
  requirements: string[]
}

const COMMON_BANK = {
  bankName: 'Zambia National Commercial Bank (Zanaco)',
  branchName: 'Mukuba Mall',
  branchCode: '098',
  swiftCode: 'Zncozmlu',
  sortCode: '010298',
} as const

const KATC_ACCOUNT_NAME = 'Kalulushi Training Centre'
const MIHAS_ACCOUNT_NAME = 'Mukuba Institute of Health and Applied Sciences'

/* ------------------------------------------------------------------ *
 * MIHAS — Diploma in Registered Nursing (RN), full time
 * Source: mihasacceptance.pdf
 * ------------------------------------------------------------------ */
const MIHAS_RN: AcceptanceProfile = {
  institutionCode: 'MIHAS',
  programCode: 'RN',
  studyMode: 'Full Time',
  refProgramTitle: 'DIPLOMA IN REGISTERED NURSING (RN)',
  programDisplayName: 'Diploma in Registered Nursing',
  studyDescriptor: 'Diploma in Registered Nursing full time',
  reportingDayMonth: '6th July',
  tuitionAccount: {
    label: 'Tuition fees',
    accountName: MIHAS_ACCOUNT_NAME,
    accountNumber: '5768098500188',
    ...COMMON_BANK,
  },
  otherFeesAccount: {
    label: 'Other fees',
    accountName: MIHAS_ACCOUNT_NAME,
    accountNumber: '5768098500289',
    ...COMMON_BANK,
  },
  feeChart: [
    { item: 'Tuition fees (first year, first semester)', amount: 8000, cadence: 'Per semester', account: '5768098500188', inTotal: false },
    { item: 'Less: 50% bursary on tuition', amount: -4000, kind: 'deduction', cadence: 'Awarded to every admitted student', inTotal: false },
    { item: 'Tuition payable after bursary', amount: 4000, kind: 'subtotal', emphasis: true, account: '5768098500188' },
    { item: 'Other fees (first year, first semester)', amount: 4200, cadence: 'Per semester', account: '5768098500289' },
    { item: 'G.N.C. indexing & manuals', amount: 1332, cadence: 'Once off — paid to GNC via the school', account: '5768098500592' },
    { item: 'Accommodation (full time students)', amount: 650, cadence: 'Per month — optional', account: '5768098500390', optional: true },
  ],
  notes: [
    'Tuition fees for the Diploma in Registered Nursing first year, first semester are K8,000. A 50% bursary is applied, so you are required to pay only K4,000.',
    'Other fees for the first year, first semester are K4,200. This amount includes Registration, Maintenance Fee, Medical Fees, Library Fees, Computer Laboratory, Objective Structured Clinical Examination (OSCE), Internal Exams, Recreation Activities, E.C.Z. Results Verification, Administrative Cost/Attachments, Rural Primary Health Care and Psychiatry.',
    'G.N.C. payment (ZANACO account 5768098500592) is a one-off payment made to GNC via the school at the time of indexing: G.N.C. Indexing K364, G.N.C. School Rules K40, Learner\u2019s Guide K273, Procedure Manuals K273, Evaluation Manual K221, Code of Conduct K100, Administrative fees K61 — total K1,332.00.',
    'Mukuba Institute of Health and Applied Sciences provides accommodation at a fee of K650 per month to full time students (ZANACO, Mukuba Mall, A/C No 5768098500390). Accommodation is optional and is not included in the intake total.',
  ],
  requirements: [
    'Two reams of plain (bond) paper A4 (Rotatrim)',
    'A nurse\u2019s watch',
    'A nurse\u2019s scissors with a chain',
    'A nurse\u2019s dictionary',
    'A clinical mercury thermometer',
    '1 box of examination gloves and 1 box of surgical gloves',
    'Roll of cotton wool (500g) / gauze',
    'Three (3) passport photos (taken in natural hair)',
    'Marriage certificate if applicable',
    '1 unit of tissue rolls',
    '1 bottle Jik',
    'Liquid hand soap',
    'Sanitizer',
    'Medical certificate',
    '2 suspension files',
  ],
}

/* ------------------------------------------------------------------ *
 * KATC — Diploma in Clinical Medicine (COG), full time
 * Source: katc cog acceptance.docx
 * ------------------------------------------------------------------ */
const KATC_COG: AcceptanceProfile = {
  institutionCode: 'KATC',
  programCode: 'COG',
  studyMode: 'Full Time',
  refProgramTitle: 'DIPLOMA IN CLINICAL MEDICINE (COG)',
  programDisplayName: 'Diploma in Clinical Medicine',
  studyDescriptor: 'Diploma in Clinical Medicine [Clinical Medicine] full time',
  reportingDayMonth: '29th June',
  commitmentDeadlineDayMonth: '9th May',
  tuitionAccount: {
    label: 'Tuition fees',
    accountName: KATC_ACCOUNT_NAME,
    accountNumber: '5729097500125',
    ...COMMON_BANK,
  },
  feeChart: [
    { item: 'Tuition fees', amount: 7500, cadence: 'Per semester', account: '5729097500125' },
    { item: 'HPCZ indexing', amount: 300, cadence: 'Once off', account: '5729097500226' },
    { item: 'Student ID', amount: 150, cadence: 'Once off', account: '5729097500226' },
    { item: 'Uniform', amount: 500, cadence: 'Once off', account: '5729097500226' },
    { item: 'Lab coat', amount: 300, cadence: 'Once off', account: '5729097500226' },
    { item: 'Friday T-shirt', amount: 300, cadence: 'Once off', account: 'Cash payment' },
    { item: 'UNZA affiliation', amount: 450, cadence: 'Per year — optional', account: '5729097500226', optional: true },
    { item: 'Accommodation (self-catering)', amount: 650, cadence: 'Per month — optional', account: 'Cash payment', optional: true },
  ],
  notes: [
    'Registration will run from 29th June to 3rd July. Late registration will attract a penalty fee of K500.',
    'Other fees are paid per semester or per year into the school account 5729097500226 (Kalulushi Training Centre, Zanaco, Mukuba Mall).',
    'Accommodation (self-catering) and the per-year UNZA affiliation fee are optional and are not included in the intake total.',
  ],
  requirements: [
    'Two reams of plain (bond) paper A4 (Rotatrim)',
    'Two certified (ECZ) Grade 12 results',
    'Four passport size photos',
    '1 dozen of tissue',
    'BP machine (personal use)',
    'Stethoscope (personal use)',
    '1 tin of Cobra (500ml)',
    'Adequate hard cover books (personal use)',
    'Examination gloves',
    'Surgical gloves',
    'Gauze roll',
    'Hand wash bottle',
    'Thermometer',
    'Suspension file',
    'Bottle of Jik (750ml)',
    'Bottle of spirit',
    'One mop',
    'One hard broom',
    'Hand sanitizer',
  ],
}

/* ------------------------------------------------------------------ *
 * KATC — Diploma in Environmental Health (EHT), distance
 * Source: katc eht acceptance.docx
 * ------------------------------------------------------------------ */
const KATC_EHT: AcceptanceProfile = {
  institutionCode: 'KATC',
  programCode: 'EHT',
  studyMode: 'Distance',
  refProgramTitle: 'DIPLOMA IN ENVIRONMENTAL HEALTH (CHA-EHT)',
  programDisplayName: 'Diploma in Environmental Health',
  studyDescriptor: 'Diploma in Environmental Health [Environmental Health Technologist (EHT)] distance',
  reportingDayMonth: '29th June',
  commitmentDeadlineDayMonth: '29th May',
  tuitionAccount: {
    label: 'Tuition fees',
    accountName: KATC_ACCOUNT_NAME,
    accountNumber: '5729097500630',
    ...COMMON_BANK,
  },
  feeChart: [
    { item: 'Tuition fees', amount: 8500, account: '5729097500630' },
    { item: 'HPCZ indexing', amount: 300, account: '5729097500226' },
    { item: 'Student ID', amount: 150, account: '5729097500226' },
    { item: 'Uniform', amount: 500, account: '5729097500226' },
    { item: 'Lab coat', amount: 300, account: '5729097500226' },
    { item: 'Friday T-shirt', amount: 300, account: 'Cash payment' },
    { item: 'Registration fee', amount: 500, account: '5729097500226' },
    { item: 'UNZA affiliation', amount: 450, cadence: 'Per year — optional', account: '5729097500226', optional: true },
  ],
  notes: [
    'Other fees are paid per semester or per year into the school account 5729097500226 (Kalulushi Training Centre, Zanaco, Mukuba Mall).',
    'Other fees payable per semester differ according to activities in that particular semester during the three-year course duration. For the first year, first semester this amount includes Registration, Identity Cards, Maintenance Fee, Medical Fees, Library Fees, Computer Laboratory, Objective Structured Clinical Examination (OSCE), Internal Exams, Recreation Activities, E.C.Z. Results Verification, and Administrative Cost for Manuals and practicum Attachments.',
    'The per-year UNZA affiliation fee is optional and is not included in the intake total.',
  ],
  requirements: [
    'Two reams of plain (bond) paper A4 (Rotatrim)',
    'Two copies of certified Grade 12 results (ECZ)',
    '4 passport size photos',
    '1 work suit (Navy Blue with reflectors)',
    'One pair of safety boots',
    '1 dozen of tissue',
    '1 tin of Cobra (500ml)',
    'Drawing board with geometric set',
    'Adequate hard cover books',
    'Examination gloves',
    'Suspension file',
    'Bottle of Jik',
    'Bottle of spirit',
    'Hand wash',
    'Hand sanitizer',
    'One standing mop',
    'One slasher',
  ],
}

const PROFILES: AcceptanceProfile[] = [MIHAS_RN, KATC_COG, KATC_EHT]

/**
 * Resolve an institution code from either a short code ("MIHAS"/"KATC") or a
 * full institution name ("Kalulushi Training Centre", "Mukuba Institute …").
 */
export function resolveInstitutionCode(
  institution: string | null | undefined,
): 'MIHAS' | 'KATC' {
  const value = (institution ?? '').trim().toLowerCase()
  if (!value) return 'MIHAS'
  if (value.includes('katc') || value.includes('kalulushi')) return 'KATC'
  if (value.includes('mihas') || value.includes('mukuba')) return 'MIHAS'
  return 'MIHAS'
}

/**
 * The mandatory total payable for the intake.
 *
 * A row contributes to the total when it is not optional and its `inTotal`
 * flag is not explicitly false. By default 'charge' and 'subtotal' rows
 * count; 'deduction' rows and the gross pre-bursary line are flagged
 * `inTotal: false` so the emphasised "payable after bursary" subtotal is the
 * single tuition figure counted (no double-counting). Optional items
 * (accommodation, per-year fees) are always excluded.
 */
export function computeIntakeTotal(feeChart: FeeChartRow[]): number {
  return feeChart.reduce((sum, row) => {
    if (row.optional) return sum
    if (row.inTotal === false) return sum
    const kind = row.kind ?? 'charge'
    if (kind === 'deduction') return sum
    return sum + row.amount
  }, 0)
}

/**
 * Build a generic fallback profile for an institution + programme that has no
 * transcribed sample yet. Uses the institution's primary tuition account and
 * omits fee-chart/requirements specifics rather than inventing them.
 */
function genericProfile(
  institutionCode: 'MIHAS' | 'KATC',
  program: string,
): AcceptanceProfile {
  const isKatc = institutionCode === 'KATC'
  const accountName = isKatc ? KATC_ACCOUNT_NAME : MIHAS_ACCOUNT_NAME
  const accountNumber = isKatc ? '5729097500125' : '5768098500188'
  const display = program?.trim() || 'your chosen programme'
  return {
    institutionCode,
    programCode: '',
    studyMode: 'Full Time',
    refProgramTitle: display.toUpperCase(),
    programDisplayName: display,
    studyDescriptor: display,
    tuitionAccount: {
      label: 'Tuition fees',
      accountName,
      accountNumber,
      ...COMMON_BANK,
    },
    feeChart: [],
    notes: [],
    requirements: [],
  }
}

/**
 * Resolve the acceptance profile for a given institution + programme.
 *
 * Matching:
 *   1. Resolve institution code from code or full name.
 *   2. Within that institution, match a programme by name substring
 *      (nursing → RN, clinical medicine → COG, environmental health → EHT).
 *   3. Fall back to a generic profile (institution banking only) when no
 *      specific sample exists.
 */
export function resolveAcceptanceProfile(
  institution: string | null | undefined,
  program: string | null | undefined,
): AcceptanceProfile {
  const code = resolveInstitutionCode(institution)
  const prog = (program ?? '').trim().toLowerCase()

  const candidates = PROFILES.filter((p) => p.institutionCode === code)
  const matched = candidates.find((p) => {
    if (p.programCode === 'RN') return prog.includes('nursing')
    if (p.programCode === 'COG') return prog.includes('clinical medicine') || prog.includes('clinical')
    if (p.programCode === 'EHT') return prog.includes('environmental health') || prog.includes('environmental')
    return false
  })

  return matched ?? genericProfile(code, program ?? '')
}
