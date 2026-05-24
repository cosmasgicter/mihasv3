#!/usr/bin/env bash
# One-shot local Postgres setup for the MIHAS admissions system.
# Creates the `cosmas` role and `mihas` database, owned by `cosmas`.
# After this runs, the `cosmas` user can connect to `mihas` via peer auth
# without further sudo needed.
#
# Run once with: sudo bash scripts/setup_local_postgres.sh

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: this script must be run with sudo." >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-cosmas}"

echo "==> Creating role '${TARGET_USER}' (superuser, login)..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TARGET_USER}') THEN
    CREATE ROLE ${TARGET_USER} WITH SUPERUSER LOGIN;
    RAISE NOTICE 'Role ${TARGET_USER} created.';
  ELSE
    ALTER ROLE ${TARGET_USER} WITH SUPERUSER LOGIN;
    RAISE NOTICE 'Role ${TARGET_USER} already exists; ensured SUPERUSER LOGIN.';
  END IF;
END
\$\$;
SQL

echo "==> Creating database 'mihas' owned by '${TARGET_USER}'..."
sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'mihas'" | grep -q 1 \
  || sudo -u postgres createdb -O "${TARGET_USER}" mihas

echo "==> Verifying connection as '${TARGET_USER}'..."
sudo -u "${TARGET_USER}" psql -d mihas -c "SELECT current_user, current_database();"

echo ""
echo "✓ Setup complete. The '${TARGET_USER}' user owns the 'mihas' database."
echo "  Connect with: psql mihas"
