#!/bin/bash
set -e
echo "Starting Judge0 stack..."
docker compose -f infra/judge0/docker-compose.yml up -d

echo "Starting app stack..."
docker compose up --build -d

echo ""
echo "Services:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:5000"
echo "  Judge0:    http://localhost:2358"
echo "  OpenWebUI: http://localhost:8080"
echo "  Ollama:    http://localhost:11434"
echo "  Postgres:  localhost:5432"