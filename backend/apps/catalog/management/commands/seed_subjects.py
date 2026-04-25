"""Seed O-Level and A-Level subjects into the subjects table.

Run: python manage.py seed_subjects
Idempotent — uses ON CONFLICT DO NOTHING on the code unique constraint.
"""

from django.core.management.base import BaseCommand
from django.db import connection


# ECZ O-Level (Grade 9) subjects
O_LEVEL_SUBJECTS = [
    ("English Language", "OL-ENG", "languages", True, "ecz_olevel"),
    ("Mathematics", "OL-MATH", "sciences", True, "ecz_olevel"),
    ("Integrated Science", "OL-INTSCI", "sciences", True, "ecz_olevel"),
    ("Social Studies", "OL-SS", "humanities", True, "ecz_olevel"),
    ("Zambian Languages", "OL-ZL", "languages", False, "ecz_olevel"),
    ("Religious Education", "OL-RE", "humanities", False, "ecz_olevel"),
    ("Civic Education", "OL-CE", "humanities", False, "ecz_olevel"),
    ("Geography", "OL-GEO", "humanities", False, "ecz_olevel"),
    ("History", "OL-HIST", "humanities", False, "ecz_olevel"),
    ("Home Economics", "OL-HE", "practical", False, "ecz_olevel"),
    ("Agricultural Science", "OL-AGR", "sciences", False, "ecz_olevel"),
    ("Art & Design", "OL-ART", "practical", False, "ecz_olevel"),
    ("Music", "OL-MUSIC", "practical", False, "ecz_olevel"),
    ("Physical Education", "OL-PE", "practical", False, "ecz_olevel"),
    ("Computer Studies", "OL-CS", "technology", False, "ecz_olevel"),
    ("Design & Technology", "OL-DT", "technology", False, "ecz_olevel"),
    ("Business Studies", "OL-BS", "commercial", False, "ecz_olevel"),
    ("French", "OL-FRENCH", "languages", False, "ecz_olevel"),
    ("Bemba", "OL-BEMBA", "languages", False, "ecz_olevel"),
    ("Nyanja", "OL-NYANJA", "languages", False, "ecz_olevel"),
    ("Tonga", "OL-TONGA", "languages", False, "ecz_olevel"),
    ("Lozi", "OL-LOZI", "languages", False, "ecz_olevel"),
]

# A-Level subjects (Zambian Senior Secondary / Cambridge equivalent)
A_LEVEL_SUBJECTS = [
    ("English Language (A-Level)", "AL-ENG", "languages", True, "a_level"),
    ("Mathematics (A-Level)", "AL-MATH", "sciences", True, "a_level"),
    ("Pure Mathematics", "AL-PMATH", "sciences", False, "a_level"),
    ("Further Mathematics", "AL-FMATH", "sciences", False, "a_level"),
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
]


class Command(BaseCommand):
    help = "Seed O-Level and A-Level subjects (idempotent)"

    def handle(self, *args, **options):
        all_subjects = O_LEVEL_SUBJECTS + A_LEVEL_SUBJECTS
        inserted = 0

        with connection.cursor() as cursor:
            for name, code, category, is_core, curriculum_type in all_subjects:
                cursor.execute(
                    """
                    INSERT INTO subjects (id, name, code, category, is_core, is_active, curriculum_type, created_at)
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, true, %s, now())
                    ON CONFLICT (code) DO NOTHING
                    """,
                    [name, code, category, is_core, curriculum_type],
                )
                if cursor.rowcount > 0:
                    inserted += 1

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {inserted} new subjects ({len(all_subjects)} total, {len(all_subjects) - inserted} already existed)"
        ))
