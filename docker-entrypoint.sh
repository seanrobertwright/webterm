#!/bin/bash
set -e

# Fix ownership of mounted volumes (may be owned by root from previous runs)
for dir in /app/backend/data /app/data; do
  [ -d "$dir" ] && chown -R node:node "$dir"
done

# Drop privileges and exec the CMD
exec gosu node "$@"
