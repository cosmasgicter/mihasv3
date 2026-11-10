"""Task 4.4: the steering beat table names exactly the tasks in CELERY_BEAT_SCHEDULE.

Compares the first column of the table under "Celery Beat Periodic Tasks" in
``.kiro/steering/tech.md`` with the last dotted segment of each schedule entry's
``task`` value (R9.4).
"""
import re
from pathlib import Path

from django.conf import settings

REPO_ROOT = Path(__file__).resolve().parents[3]
TECH_MD = REPO_ROOT / ".kiro" / "steering" / "tech.md"


def _table_task_names() -> list[str]:
    text = TECH_MD.read_text()
    section = text.split("## Celery Beat Periodic Tasks", 1)[1].split("\n## ", 1)[0]
    return re.findall(r"^\|\s*`([a-z_0-9]+)`\s*\|", section, flags=re.MULTILINE)


def test_beat_table_matches_schedule():
    scheduled = sorted(
        entry["task"].rsplit(".", 1)[-1] for entry in settings.CELERY_BEAT_SCHEDULE.values()
    )
    documented = _table_task_names()
    assert len(documented) == len(set(documented)), "duplicate row in the beat table"
    assert sorted(documented) == scheduled
