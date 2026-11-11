"""Task 6.3 (R7.5): rows a transactional test writes to a ``managed = False`` table
do not survive into the next test, and Django's own tables keep their rows.

The second test asserts the table is empty and the Django tables still hold rows,
so it also passes when it is scheduled on a different xdist worker; it fails on a
worker that reused the first test's database and did not clean it.
"""
import pytest

from apps.analytics.models import AnalyticsSnapshot


@pytest.mark.django_db(transaction=True)
def test_a_transactional_test_writes_to_an_unmanaged_table():
    assert AnalyticsSnapshot._meta.managed is False
    AnalyticsSnapshot.objects.create(snapshot_type="cleanup-probe", payload={})
    assert AnalyticsSnapshot.objects.count() >= 1


@pytest.mark.django_db(transaction=True)
def test_b_next_transactional_test_finds_the_table_empty_and_django_tables_intact():
    from django.contrib.auth.models import Permission
    from django.contrib.contenttypes.models import ContentType

    assert AnalyticsSnapshot.objects.count() == 0
    assert ContentType.objects.exists()
    assert Permission.objects.exists()
