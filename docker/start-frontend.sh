#!/bin/sh
set -eu

if [ -n "${POSTGRES_PRISMA_URL:-}" ] && [ -n "${POSTGRES_URL_NON_POOLING:-}" ]; then
  echo "Syncing Prisma schema to database..."
  ./node_modules/.bin/prisma db push --skip-generate
  echo "Seeding core database records..."
  ./node_modules/.bin/tsx ./src/server/prisma/seed.ts
  echo "Running database safety preflight..."
  node ./docker/db-preflight-check.mjs
else
  echo "Skipping Prisma schema sync because database environment variables are not set."
fi

node ./docker/print-model-route-summary.mjs

exec npm start
