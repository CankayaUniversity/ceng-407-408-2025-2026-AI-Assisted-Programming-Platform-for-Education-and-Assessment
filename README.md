# AI-Assisted Programming Platform for Education and Assessment

Web platform for programming courses with AI-assisted hints, secure code execution, and teacher/student role flows.

## Quick start

From repository root:

```bash
cp .env.example .env
cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf
npm run up:all
npm run setup
npm run smoke
```

Main URLs:

- Frontend: `http://localhost:5173`
- Backend API (direct): `http://localhost:5000`
- In Docker, the browser talks to the **same host/port** as the UI: nginx proxies `/api/*` to the backend, so you only need to expose **5173** publicly (no separate `VITE_API_BASE_URL` for the built image).
- Backend readiness: `http://localhost:5000/api/health/ready` (or `http://localhost:5173/api/health/ready` through nginx)

Stop:

```bash
npm run down:all
```

## Core stack

- Frontend: React + Vite + Material-UI
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- AI runtime: Ollama (Open WebUI optional interface)
- Code execution: Judge0 (Docker-sandboxed)

## Supported languages

| Language | Run (raw) | Submit (test cases) |
|----------|-----------|---------------------|
| Python | Yes | Yes |
| C | Yes | Yes |
| C++ | Yes | Yes |
| C# | Yes | Yes |
| JavaScript | Yes | Yes |
| Java | Yes | Yes |

## Common operations

```bash
# app stack only
npm run up

# judge0 only
npm run up:judge0

# migrations and seed
npm run db:migrate
npm run db:seed

# backend logs
npm run logs
```

## Key API endpoints

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- Problems: `/api/problems`, `/api/problems/:id` (CRUD for teachers)
- AI chat: `/api/ai/chat`, `/api/ai/hint`
- Code run: `/api/execute`
- Student: `/api/student/history`, `/api/student/history/ai`
- Teacher: `/api/teacher/students`, `/api/teacher/class/overview`
- Admin: `/api/admin/exam-mode`
- Health: `/health`, `/api/health/live`, `/api/health/ready`

## Operations and deployment

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- `.env` created from `.env.example`
- Judge0 config: `infra/judge0/judge0.conf` created from `judge0.conf.example`

### Judge0 sandbox strategy

Code execution uses a **3-layer Docker-level sandbox**:

| Layer | What | Where |
|-------|------|-------|
| **1 — Docker Container** | PID namespace, filesystem, process isolation | docker-compose.yml |
| **2 — Docker Resource Limits** | memory: 512m, cpus: 1.0, pids: 128 | docker-compose.yml |
| **3 — Judge0 App Limits** | CPU_TIME_LIMIT: 5s, WALL_TIME_LIMIT: 10s, MEMORY_LIMIT: 128MB | judge0.conf |

Judge0's internal `isolate` sandbox (`ENABLE_SANDBOX`) requires cgroup v1, which is
unavailable on Docker Desktop (Windows/macOS use cgroup v2 via WSL2/HyperKit).
Docker-level isolation is the industry standard for containerized code judges and
provides equivalent security through container namespace isolation and hard resource limits.

On native Linux servers with cgroup v1 support, set `ENABLE_SANDBOX=true` in
`judge0.conf` for an additional kernel-level isolation layer.

This project uses a community-maintained fork
([`mrkushalsm/judge0`](https://hub.docker.com/r/mrkushalsm/judge0)) based on the
official Judge0 codebase. See
[judge0/judge0#543](https://github.com/judge0/judge0/issues/543) for upstream status.

### Production-like deploy (single server)

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

Optional seed:

```bash
docker compose exec backend npm run prisma:seed
```

### Verification checklist

- Backend health is `ok`
- Login works for demo student and teacher
- Problem list loads
- `Run` returns stdout/stderr output
- `Submit` runs test cases and records submission
- AI chat returns mentor response
- Exam mode toggle disables AI chat for students

### Incident quick actions

- Restart backend: `docker compose restart backend`
- Restart frontend: `docker compose restart frontend`
- Full restart: `npm run down:all && npm run up:all`
- Re-run setup if schema/data drift occurs: `npm run setup`

### Rollback (manual)

If deployment fails:

1. Checkout last known good commit/tag.
2. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```
3. Re-verify health + smoke checks.
