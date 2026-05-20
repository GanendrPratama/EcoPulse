#!/bin/bash
# Wait for Cassandra to be ready, then run the CQL init script.
set -e

echo "⏳ Waiting for Cassandra to be ready..."

until cqlsh cassandra -e "DESCRIBE CLUSTER" > /dev/null 2>&1; do
  sleep 3
done

echo "✅ Cassandra is ready. Initializing schema..."
cqlsh cassandra -f /init.cql
echo "✅ Schema initialized successfully."
