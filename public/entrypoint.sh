#!/bin/sh
set -e

# Ensure the shared data directory is writable by the worker user.
mkdir -p /data
chown -R appuser:appuser /data

exec su appuser -s /bin/sh -c "python -u /app/worker.py"
