"""Student-journey-repair task 2.1 (clause 3.16): the test DB host guard."""
from __future__ import annotations

import pytest

from tests.db_host_guard import (
    assert_test_database_host_is_local,
    is_local_test_database_host,
)


@pytest.mark.parametrize(
    "host",
    [
        "",
        None,
        "localhost",
        "127.0.0.1",
        "127.5.5.5",
        "::1",
        "[::1]",
        "10.1.2.3",
        "172.16.0.9",
        "172.31.255.1",
        "192.168.1.20",
        "postgres",  # dot-free Docker service name
        "mihas-postgres-1",
    ],
)
def test_local_hosts_are_accepted(host):
    assert is_local_test_database_host(host) is True


@pytest.mark.parametrize(
    "host",
    [
        "ep-dawn-unit-123-pooler.c-3.us-east-1.aws.neon.tech",
        "db.example.neon.tech",
        "mydb.abc.us-east-1.rds.amazonaws.com",
        "ec2-13-244-37-190.af-south-1.compute.amazonaws.com",
        "api.beanola.com",
        "db.beanola.com",
        "8.8.8.8",
        "172.32.0.1",  # just outside RFC 1918
        "example.org",
        "NEON.TECH",
    ],
)
def test_managed_or_public_hosts_are_refused(host):
    assert is_local_test_database_host(host) is False


def test_marker_wins_over_a_local_looking_name():
    # A dot-free-looking prefix cannot launder a managed suffix.
    assert is_local_test_database_host("10.0.0.5.neon.tech") is False


def test_assert_passes_for_local_databases():
    assert_test_database_host_is_local(
        {"default": {"HOST": "127.0.0.1"}, "replica": {"HOST": ""}}
    )


def test_assert_refuses_a_remote_alias_without_echoing_the_host():
    with pytest.raises(RuntimeError) as excinfo:
        assert_test_database_host_is_local(
            {"default": {"HOST": "ep-secret-name.c-3.us-east-1.aws.neon.tech"}}
        )
    message = str(excinfo.value)
    assert "default" in message
    assert "ep-secret-name" not in message


def test_ci_database_url_shape_is_accepted():
    """CI uses postgresql://postgres:postgres@localhost:5432/test_mihas."""
    import dj_database_url

    config = dj_database_url.parse("postgresql://postgres:postgres@localhost:5432/test_mihas")
    assert_test_database_host_is_local({"default": config})
    local = dj_database_url.parse(
        "postgresql://postgres:postgres@127.0.0.1:55432/test_mihas"
    )
    assert_test_database_host_is_local({"default": local})
