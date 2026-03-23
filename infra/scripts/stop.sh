#!/bin/bash
set -e
echo "Stopping app stack..."
docker compose down

echo "Stopping Judge0 stack..."
docker compose -f infra/judge0/docker-compose.yml down

echo "All services stopped."