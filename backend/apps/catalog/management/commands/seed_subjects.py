"""Seed ECZ Grade 12 and A-Level subjects into the subjects table.

Run: python manage.py seed_subjects
Idempotent — uses ON CONFLICT DO NOTHING on the code unique constraint.
"""

from django.core.management.base import BaseCommand
from django.db import connection


# ECZ Grade 12 (Senior Secondary Certificate) — complete per ECZ syllabus
GRADE_12_SUBJECTS = [
    # Core
    ("English Language", "ENG", "core", True, "ecz"),
    ("Mathematics", "MATH", "core", True, "ecz"),
    ("Civic Education", "CE", "core", True, "ecz"),
    # Sciences
    ("Biology", "BIO", "sciences", False, "ecz"),
    ("Chemistry", "CHEM", "sciences", False, "ecz"),
    ("Physics", "PHY", "sciences", False, "ecz"),
    ("Science", "SCI", "sciences", False, "ecz"),
    ("Integrated Science", "INTSCI", "sciences", False, "ecz"),
    ("Agricultural Science", "AGR", "sciences", False, "ecz"),
    ("Additional Mathematics", "ADDMATH", "sciences", False, "ecz"),
    ("Ordinary Mathematics", "OMATH", "sciences", False, "ecz"),
    # Commercial
    ("Commerce", "COM", "commercial", False, "ecz"),
    ("Principles of Accounts", "POA", "commercial", False, "ecz"),
    ("Economics", "ECON", "commercial", False, "ecz"),
    ("Business Studies", "BS", "commercial", False, "ecz"),
    ("Office Practice", "OP", "commercial", False, "ecz"),
    ("Entrepreneurship", "ENT", "commercial", False, "ecz"),
    # Humanities
    ("Geography", "GEO", "humanities", False, "ecz"),
    ("History", "HIST", "humanities", False, "ecz"),
    ("Religious Education", "RE", "humanities", False, "ecz"),
    ("Development Studies", "DS", "humanities", False, "ecz"),
    ("Literature in English", "LIT", "humanities", False, "ecz"),
    # Technology
    ("Computer Studies", "CS", "technology", False, "ecz"),
    ("ICT", "ICT", "technology", False, "ecz"),
    ("Design & Technology", "DT", "technology", False, "ecz"),
    ("Metalwork", "MW", "technology", False, "ecz"),
    ("Woodwork", "WW", "technology", False, "ecz"),
    ("Technical Drawing", "TD", "technology", False, "ecz"),
    ("Power Mechanics", "PM", "technology", False, "ecz"),
    # Practical / Creative
    ("Home Economics", "HE", "practical", False, "ecz"),
    ("Food & Nutrition", "FN", "practical", False, "ecz"),
    ("Art & Design", "ART", "practical", False, "ecz"),
    ("Music", "MUSIC", "practical", False, "ecz"),
    ("Physical Education", "PE", "practical", False, "ecz"),
    ("Fashion & Fabrics", "FF", "practical", False, "ecz"),
    # Languages
    ("French", "FRENCH", "languages", False, "ecz"),
    ("Portuguese", "PORT", "languages", False, "ecz"),
    ("Bemba", "BEMBA", "languages", False, "ecz"),
    ("Nyanja", "NYANJA", "languages", False, "ecz"),
    ("Tonga", "TONGA", "languages", False, "ecz"),
    ("Lozi", "LOZI", "languages", False, "ecz"),
    ("Kaonde", "KAONDE", "languages", False, "ecz"),
    ("Lunda", "LUNDA", "languages", False, "ecz"),
    ("Luvale", "LUVALE", "languages", False, "ecz"),
]

# A-Level (GCE Advanced Level / Cambridge)
A_LEVEL_SUBJECTS = [
    ("English Language (A-Level)", "AL-ENG", "languages", False, "a_level"),
    ("Pure Mathematics (A-Level)", "AL-PMATH", "sciences", False, "a_level"),
    ("Further Mathematics (A-Level)", "AL-FMATH", "sciences", False, "a_level"),
    ("Biology (A-Level)", "AL-BIO", "sciences", False, "a_level"),
    ("Chemistry (A-Level)", "AL-CHEM", "sciences", False, "a_level"),
    ("Physics (A-Level)", "AL-PHY", "sciences", False, "a_level"),
    ("Geography (A-Level)", "AL-GEO", "humanities", False, "a_level"),
    ("History (A-Level)", "AL-HIST", "humanities", False, "a_level"),
    ("Economics (A-Level)", "AL-ECON", "commercial", False, "a_level"),
    ("Accounting (A-Level)", "AL-ACC", "commercial", False, "a_level"),
    ("Business Studies (A-Level)", "AL-BS", "commercial", False, "a_level"),
    ("Computer Science (A-Level)", "AL-CS", "technology", False, "a_level"),
    ("Sociology (A-Level)", "AL-SOC", "humanities", False, "a_level"),
    ("Psychology (A-Level)", "AL-PSY", "humanities", False, "a_level"),
    ("Religious Studies (A-Level)", "AL-RS", "humanities", False, "a_level"),
    ("French (A-Level)", "AL-FRENCH", "languages", False, "a_level"),
    ("Literature in English (A-Level)", "AL-LIT", "languages", False, "a_level"),
    ("Art & Design (A-Level)", "AL-ART", "practical", False, "a_level"),
    ("Law (A-Level)", "AL-LAW", "humanities", False, "a_level"),
]


class Command(BaseCommand):
    help = "Seed ECZ Grade 12 and A-Level subjects (idempotent)"

    def handle(self, *args, **options):
        all_subjects = GRADE_12_SUBJECTS + A_LEVEL_SUBJECTS
        inserted = 0

        with connection.cursor() as cursor:
            for name, code, category, is_core, curriculum_type in all_subjects:
                cursor.execute(
                    """
                    INSERT INTO subjects (id, name, code, category, is_core, is_active, curriculum_type, created_at)
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, true, %s, now())
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
                        category = EXCLUDED.category,
                        is_core = EXCLUDED.is_core,
                        curriculum_type = EXCLUDED.curriculum_type
                    WHERE subjects.name != EXCLUDED.name
                       OR subjects.category != EXCLUDED.category
                       OR subjects.is_core != EXCLUDED.is_core
                    """,
                    [name, code, category, is_core, curriculum_type],
                )
                if cursor.rowcount > 0:
                    inserted += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {inserted} subjects ({len(all_subjects)} total checked)"
        ))
