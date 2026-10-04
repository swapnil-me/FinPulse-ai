#!/bin/sh
set -e

echo "Waiting for database to be reachable..."
i=0
while [ $i -lt 30 ]; do
  if python -c "
import psycopg, os, sys
try:
    url = os.environ.get('DATABASE_URL', '')
    # Parse out host/port/user/pass/db from the URL for a direct test
    # postgresql+psycopg://user:pass@host:port/dbname
    import re
    m = re.match(r'postgresql\+psycopg://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)', url)
    if not m:
        sys.exit(1)
    user, password, host, port, dbname = m.groups()
    conn = psycopg.connect(host=host, port=int(port), user=user, password=password, dbname=dbname, connect_timeout=2)
    conn.close()
    sys.exit(0)
except Exception as e:
    sys.exit(1)
" 2>/dev/null; then
    echo "Database is up after ${i}s."
    break
  fi
  i=$((i + 1))
  echo "  attempt $i/30 — retrying in 1s..."
  sleep 1
done

echo "Running database migrations..."
alembic upgrade head

echo "Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
