#!/bin/sh
set -e
echo "[entrypoint] Applying Prisma migrations..."
npx prisma migrate deploy
exec "$@"
