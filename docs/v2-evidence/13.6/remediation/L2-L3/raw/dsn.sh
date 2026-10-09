# Helper sourced by the L2-L3 rehearsal steps. NOT an artifact - it holds no
# secret itself: it derives the Neon rehearsal-branch DSN from backend/.env at
# run time. backend/.env is gitignored; nothing here is ever printed.
#
#   branch : br-jolly-pine-ahybtg2e (v2-task-3.2-rehearsal)
#   endpoint: ep-proud-cherry-ah8n4q0f
#   project : mihasApplication / wild-bar-37055823
#
# usage:  . docs/v2-evidence/13.6/remediation/L2-L3/raw/dsn.sh <database>
#         echo "$DSN"        # never do this
_db="${1:-neondb}"
DSN="$(cd "$(git rev-parse --show-toplevel)/backend" && python3 - "$_db" <<'PY'
import re, sys, urllib.parse
db = sys.argv[1]
raw = re.search(r'^DATABASE_URL=(.*)$', open('.env').read(), re.M).group(1).strip().strip('"')
u = urllib.parse.urlparse(raw)
host = "ep-proud-cherry-ah8n4q0f.c-3.us-east-1.aws.neon.tech"
print(f"postgresql://{u.username}:{u.password}@{host}/{db}?sslmode=require")
PY
)"
export DSN
