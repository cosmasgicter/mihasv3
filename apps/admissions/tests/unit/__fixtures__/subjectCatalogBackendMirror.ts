/**
 * Mirror of `backend/apps/catalog/subject_catalog.py` — the canonical subject
 * catalogue, its versioned alias inventory, and the retired duplicate codes.
 *
 * Admissions-v2 task 7.1 (R11.4/R11.5, finding STU-11). The backend module is the
 * authority; `subjectCatalogDrift.test.ts` compares this fixture against the
 * frontend presentation/alias mirrors so a catalogue edit cannot land on one side
 * only. Regenerate with:
 *
 *   cd backend && python -c "from apps.catalog.subject_catalog import *"  # see docs/v2-evidence/7.1/README.md
 *
 * Do not hand-edit one side to make the test pass.
 */
export const BACKEND_SUBJECT_CATALOG_VERSION = "ecz-62-1b6a730c7f9ab9e7"

export const BACKEND_SUBJECT_CATEGORIES: readonly string[] = ["core", "sciences", "commercial", "humanities", "technology", "practical", "languages"]

export const BACKEND_CANONICAL_SUBJECTS: ReadonlyArray<{
  readonly code: string
  readonly name: string
  readonly category: string
  readonly curriculumType: string
}> = [
  { code: "ENG", name: "English Language", category: "core", curriculumType: "ecz" },
  { code: "MATH", name: "Mathematics", category: "core", curriculumType: "ecz" },
  { code: "CE", name: "Civic Education", category: "core", curriculumType: "ecz" },
  { code: "BIO", name: "Biology", category: "sciences", curriculumType: "ecz" },
  { code: "CHEM", name: "Chemistry", category: "sciences", curriculumType: "ecz" },
  { code: "PHY", name: "Physics", category: "sciences", curriculumType: "ecz" },
  { code: "SCI", name: "Science", category: "sciences", curriculumType: "ecz" },
  { code: "INTSCI", name: "Integrated Science", category: "sciences", curriculumType: "ecz" },
  { code: "AGR", name: "Agricultural Science", category: "sciences", curriculumType: "ecz" },
  { code: "ADDMATH", name: "Additional Mathematics", category: "sciences", curriculumType: "ecz" },
  { code: "COM", name: "Commerce", category: "commercial", curriculumType: "ecz" },
  { code: "POA", name: "Principles of Accounts", category: "commercial", curriculumType: "ecz" },
  { code: "ECON", name: "Economics", category: "commercial", curriculumType: "ecz" },
  { code: "BS", name: "Business Studies", category: "commercial", curriculumType: "ecz" },
  { code: "OP", name: "Office Practice", category: "commercial", curriculumType: "ecz" },
  { code: "ENT", name: "Entrepreneurship", category: "commercial", curriculumType: "ecz" },
  { code: "GEO", name: "Geography", category: "humanities", curriculumType: "ecz" },
  { code: "HIST", name: "History", category: "humanities", curriculumType: "ecz" },
  { code: "RE", name: "Religious Education", category: "humanities", curriculumType: "ecz" },
  { code: "DS", name: "Development Studies", category: "humanities", curriculumType: "ecz" },
  { code: "LIT", name: "Literature in English", category: "humanities", curriculumType: "ecz" },
  { code: "CS", name: "Computer Studies", category: "technology", curriculumType: "ecz" },
  { code: "ICT", name: "ICT", category: "technology", curriculumType: "ecz" },
  { code: "DT", name: "Design & Technology", category: "technology", curriculumType: "ecz" },
  { code: "MW", name: "Metalwork", category: "technology", curriculumType: "ecz" },
  { code: "WW", name: "Woodwork", category: "technology", curriculumType: "ecz" },
  { code: "TD", name: "Technical Drawing", category: "technology", curriculumType: "ecz" },
  { code: "PM", name: "Power Mechanics", category: "technology", curriculumType: "ecz" },
  { code: "HE", name: "Home Economics", category: "practical", curriculumType: "ecz" },
  { code: "FN", name: "Food & Nutrition", category: "practical", curriculumType: "ecz" },
  { code: "ART", name: "Art & Design", category: "practical", curriculumType: "ecz" },
  { code: "MUSIC", name: "Music", category: "practical", curriculumType: "ecz" },
  { code: "PE", name: "Physical Education", category: "practical", curriculumType: "ecz" },
  { code: "FF", name: "Fashion & Fabrics", category: "practical", curriculumType: "ecz" },
  { code: "FRENCH", name: "French", category: "languages", curriculumType: "ecz" },
  { code: "PORT", name: "Portuguese", category: "languages", curriculumType: "ecz" },
  { code: "BEMBA", name: "Bemba", category: "languages", curriculumType: "ecz" },
  { code: "NYANJA", name: "Nyanja", category: "languages", curriculumType: "ecz" },
  { code: "TONGA", name: "Tonga", category: "languages", curriculumType: "ecz" },
  { code: "LOZI", name: "Lozi", category: "languages", curriculumType: "ecz" },
  { code: "KAONDE", name: "Kaonde", category: "languages", curriculumType: "ecz" },
  { code: "LUNDA", name: "Lunda", category: "languages", curriculumType: "ecz" },
  { code: "LUVALE", name: "Luvale", category: "languages", curriculumType: "ecz" },
  { code: "AL-ENG", name: "English Language (A-Level)", category: "languages", curriculumType: "a_level" },
  { code: "AL-PMATH", name: "Pure Mathematics (A-Level)", category: "sciences", curriculumType: "a_level" },
  { code: "AL-FMATH", name: "Further Mathematics (A-Level)", category: "sciences", curriculumType: "a_level" },
  { code: "AL-BIO", name: "Biology (A-Level)", category: "sciences", curriculumType: "a_level" },
  { code: "AL-CHEM", name: "Chemistry (A-Level)", category: "sciences", curriculumType: "a_level" },
  { code: "AL-PHY", name: "Physics (A-Level)", category: "sciences", curriculumType: "a_level" },
  { code: "AL-GEO", name: "Geography (A-Level)", category: "humanities", curriculumType: "a_level" },
  { code: "AL-HIST", name: "History (A-Level)", category: "humanities", curriculumType: "a_level" },
  { code: "AL-ECON", name: "Economics (A-Level)", category: "commercial", curriculumType: "a_level" },
  { code: "AL-ACC", name: "Accounting (A-Level)", category: "commercial", curriculumType: "a_level" },
  { code: "AL-BS", name: "Business Studies (A-Level)", category: "commercial", curriculumType: "a_level" },
  { code: "AL-CS", name: "Computer Science (A-Level)", category: "technology", curriculumType: "a_level" },
  { code: "AL-SOC", name: "Sociology (A-Level)", category: "humanities", curriculumType: "a_level" },
  { code: "AL-PSY", name: "Psychology (A-Level)", category: "humanities", curriculumType: "a_level" },
  { code: "AL-RS", name: "Religious Studies (A-Level)", category: "humanities", curriculumType: "a_level" },
  { code: "AL-FRENCH", name: "French (A-Level)", category: "languages", curriculumType: "a_level" },
  { code: "AL-LIT", name: "Literature in English (A-Level)", category: "languages", curriculumType: "a_level" },
  { code: "AL-ART", name: "Art & Design (A-Level)", category: "practical", curriculumType: "a_level" },
  { code: "AL-LAW", name: "Law (A-Level)", category: "humanities", curriculumType: "a_level" },
]

export const BACKEND_SUBJECT_ALIASES: Readonly<Record<string, string>> = {
  "accounting": "POA",
  "accounts": "POA",
  "add math": "ADDMATH",
  "add maths": "ADDMATH",
  "additional math": "ADDMATH",
  "agric": "AGR",
  "agric science": "AGR",
  "agriculture": "AGR",
  "art": "ART",
  "art design": "ART",
  "bio": "BIO",
  "bus studies": "BS",
  "business": "BS",
  "chem": "CHEM",
  "civics": "CE",
  "combined science": "SCI",
  "commercial studies": "COM",
  "computer science": "CS",
  "computer studies": "CS",
  "design technology": "DT",
  "dev studies": "DS",
  "econ": "ECON",
  "eng": "ENG",
  "english": "ENG",
  "english literature": "LIT",
  "fashion fabrics": "FF",
  "food nutrition": "FN",
  "general science": "SCI",
  "geog": "GEO",
  "hist": "HIST",
  "home management": "HE",
  "information technology": "ICT",
  "lit in english": "LIT",
  "literature": "LIT",
  "math": "MATH",
  "maths": "MATH",
  "ordinary mathematics": "MATH",
  "ordinary maths": "MATH",
  "ordinary science": "SCI",
  "pe": "PE",
  "phy": "PHY",
  "phys": "PHY",
  "phys ed": "PE",
  "physical science": "SCI",
  "poa": "POA",
  "principles of accounting": "POA",
  "re": "RE",
  "religious studies": "RE",
  "td": "TD",
  "tech drawing": "TD",
}

export const BACKEND_LEGACY_DUPLICATE_CODES: Readonly<Record<string, string>> = {
  "ADD_MATH": "ADDMATH",
  "MUS": "MUSIC",
  "PHYS": "PHY",
}
