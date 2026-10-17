#!/bin/sh
set -eu
export PORT="${PORT:-8080}"
case "$PORT" in ''|*[!0-9]*) echo 'PORT must be a number' >&2; exit 1;; esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then echo 'PORT must be between 1024 and 65535' >&2; exit 1; fi
# The internal listener is deliberately fixed and never published by Docker.
export API_PORT=3001
export CACHE_DIR=/data/news
mkdir -p "$CACHE_DIR"
# Railway volumes start root-owned. Drop privileges after initializing the mount.
chown node:node "$CACHE_DIR"
envsubst '${PORT}' < /app/deploy/nginx.conf.template > /tmp/nginx.conf
exec su-exec node:node /sbin/tini -g -- node /app/deploy/supervisor.mjs
