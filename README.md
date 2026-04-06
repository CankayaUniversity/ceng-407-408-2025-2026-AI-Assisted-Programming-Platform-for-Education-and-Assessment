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
- Backend API: `http://localhost:5000`
- Backend readiness: `http://localhost:5000/api/health/ready`

Stop:

```bash
npm run down:all
```

## Core stack

- Frontend: React + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- AI runtime: Ollama (Open WebUI optional interface)
- Code execution: Judge0

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
- Problems: `/api/problems`, `/api/problems/:id`
- AI chat: `/api/ai/chat`
- Code run: `/api/execute`
- Health: `/health`, `/api/health/live`, `/api/health/ready`

## Operations and deployment

### Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- `.env` created from `.env.example`
- Optional local Judge0 config: `infra/judge0/judge0.conf` from example

### Judge0 cgroup compatibility

The official Judge0 image (`judge0/judge0`) requires cgroup v1, but modern
kernels (Ubuntu 22.04+, WSL 2 kernel 6.6+) enforce cgroup v2 and no longer
allow downgrading. This causes sandbox failures:

```
Cannot write /sys/fs/cgroup/memory/box-*/tasks: No such file or directory
```

This project uses a community-maintained fork
([`mrkushalsm/judge0`](https://hub.docker.com/r/mrkushalsm/judge0)) that adds
a runtime guard for **both cgroup v1 and v2** compatibility. The fork is based
on the official Judge0 codebase with the isolate sandbox updated to support the
unified cgroup hierarchy. See
[judge0/judge0#543](https://github.com/judge0/judge0/issues/543) for upstream
status. No host-level kernel or GRUB changes are required.

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
- `Run` and `Run Tests` return output
- AI chat returns mentor response

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
