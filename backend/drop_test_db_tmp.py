import psycopg2

url = None
with open("/home/cosmas/Downloads/mihasv3/backend/.env") as f:
    for line in f:
        if line.startswith("DATABASE_URL="):
            url = line.strip().split("=", 1)[1]
            break

conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()
cur.execute(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
    "WHERE datname='test_neondb' AND pid<>pg_backend_pid();"
)
print("terminated", cur.fetchall())
try:
    cur.execute('DROP DATABASE IF EXISTS test_neondb;')
    print("dropped test_neondb")
except Exception as e:
    print("drop error:", e)
cur.close()
conn.close()
