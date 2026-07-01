#!/usr/bin/env bash
set -e

echo "==> Waiting for database..."
python -c "
import time, sys
import psycopg2
from app.config import settings
for i in range(30):
    try:
        psycopg2.connect(
            dbname=settings.POSTGRES_DB, user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD, host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
        ).close()
        print('Database is ready.')
        sys.exit(0)
    except Exception as e:
        print(f'  db not ready ({i}): {e}')
        time.sleep(2)
sys.exit(1)
"

echo "==> Running database migrations..."
alembic upgrade head

echo "==> Seeding baseline data (bots, achievements, challenges)..."
python -m app.seed

echo "==> Starting application (API + Telegram bot)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
