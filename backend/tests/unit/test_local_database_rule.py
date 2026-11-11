"""Task 6.6 (R1.5): seed and bootstrap commands write only to a Local_Database."""
import pytest
from django.core.management.base import CommandError

from apps.common.local_database import LOCAL_DATABASE_HOSTS, require_local_database

NON_PROD = {"DJANGO_SETTINGS_MODULE": "config.settings.harness"}


def _env(url, **extra):
    return {**NON_PROD, "DATABASE_URL": url, **extra}


@pytest.mark.parametrize("host", sorted(LOCAL_DATABASE_HOSTS))
def test_each_allowlisted_host_is_accepted(host):
    shown = f"[{host}]" if ":" in host else host
    require_local_database("cmd", _env(f"postgres://u:p@{shown}:5432/db"))


def test_allowlist_is_exactly_the_four_hosts():
    assert LOCAL_DATABASE_HOSTS == {"localhost", "127.0.0.1", "::1", "postgres"}


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:secret-pw@db.internal.example:5432/db",
        "postgres://u:secret-pw@10.0.0.5:5432/db",
        "postgres://u:secret-pw@ep-x-pooler.c-3.us-east-1.aws.neon.tech/db",
        "postgres://u:secret-pw@postgres.example.com/db",
        "postgres://u:secret-pw@localhost.evil.example/db",
        "",
    ],
)
def test_a_remote_or_missing_host_is_refused_without_echoing_the_url(url):
    with pytest.raises(CommandError) as excinfo:
        require_local_database("harness_seed_tenants", _env(url))
    assert excinfo.value.returncode == 2
    message = str(excinfo.value)
    assert "harness_seed_tenants" in message
    assert "DATABASE_URL" in message
    assert "secret-pw" not in message
    assert url == "" or url not in message


def test_production_settings_over_the_postgres_host_are_refused():
    with pytest.raises(CommandError) as excinfo:
        require_local_database(
            "harness_bootstrap",
            {"DJANGO_SETTINGS_MODULE": "config.settings.prod", "DATABASE_URL": "postgres://u:p@postgres:5432/db"},
        )
    assert excinfo.value.returncode == 2
    assert "production settings" in str(excinfo.value)


def test_environment_production_is_refused_too():
    with pytest.raises(CommandError):
        require_local_database("cmd", _env("postgres://u:p@postgres/db", ENVIRONMENT="Production"))


def test_both_commands_call_the_rule_first():
    import inspect

    from apps.catalog.management.commands import harness_seed_tenants
    from apps.common.management.commands import harness_bootstrap

    for module, name in ((harness_bootstrap, "harness_bootstrap"), (harness_seed_tenants, "harness_seed_tenants")):
        source = inspect.getsource(module.Command.handle)
        first_statement = [ln for ln in source.splitlines()[1:] if ln.strip() and not ln.strip().startswith("#")][0]
        assert f'require_local_database("{name}")' in first_statement
