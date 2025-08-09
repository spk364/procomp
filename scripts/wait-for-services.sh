#!/usr/bin/env bash
set -euo pipefail

PG_HOST=${PG_HOST:-localhost}
PG_PORT=${PG_PORT:-5432}
PG_USER=${PG_USER:-postgres}
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

retry() {
  local -r max=$1; shift
  local -r cmd="$@"
  for i in $(seq 1 "$max"); do
    if eval "$cmd"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

echo "Waiting for Postgres at ${PG_HOST}:${PG_PORT}..."
retry 60 "pg_isready -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} >/dev/null 2>&1" || { echo "Postgres not ready"; exit 1; }

echo "Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
retry 60 "(echo PING | nc -w 1 ${REDIS_HOST} ${REDIS_PORT} | grep -q PONG)" || { echo "Redis not ready"; exit 1; }

echo "All services are healthy."