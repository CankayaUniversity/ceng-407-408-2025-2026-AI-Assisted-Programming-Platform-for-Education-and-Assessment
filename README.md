# AI-Assisted Programming Platform for Education and Assessment

Web platform for programming courses with AI-assisted hints (mentor role), secure code execution, and instructor tooling.

## Repository layout

```
├── frontend/              → React frontend (scaffold / future UI)
├── backend/               → Node.js / Express API + Prisma
├── infra/
│   ├── judge0/            → Judge0 stack (separate compose)
│   │   ├── docker-compose.yml
│   │   └── judge0.conf.example   (copy to judge0.conf; gitignored secrets)
│   └── scripts/           → Helper scripts (start / stop / reset)
├── docs/                  → Project notes and checklists
├── info/                  → Design and requirements PDFs
├── docker-compose.yml     → Application services
├── .env.example           → Environment template
└── .env                   → Local secrets (gitignored)
```

## Services

### Main stack (`docker-compose.yml`)

| Service   | Port  | Description        |
|----------|-------|--------------------|
| Frontend | 5173  | React dev server   |
| Backend  | 5000  | Express API        |
| Postgres | 5432  | App database       |
| Ollama   | 11434 | Local LLM runtime  |
| Open WebUI | 8080 | Optional UI for talking to models |

### Judge0 stack (`infra/judge0/docker-compose.yml`)

| Service        | Port | Description           |
|----------------|------|-----------------------|
| Judge0 server  | 2358 | Code execution API    |
| Judge0 worker  | —    | Sandbox workers       |
| Judge0 DB/Redis| —    | Internal queue/state  |

## Backend (local, without Docker)

From `backend/`:

```bash
npm install
cp ../.env.example ../.env   # defines DATABASE_URL and other vars for Prisma + runtime
npm run prisma:generate      # requires DATABASE_URL (see root .env)
npm run dev
```

If you only need the HTTP server and will run Prisma later, you can start the API with a dummy URL just to satisfy the config loader:

```bash
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db   # Windows cmd
# export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db  # Unix
npm run prisma:generate
```

Health checks: `GET http://localhost:5000/health` and `GET http://localhost:5000/api/health`.

## Setup

### 1. Environment files

```bash
cp .env.example .env
cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf
```

### 2. Start stacks

```bash
bash infra/scripts/start.sh
```

Or manually:

```bash
docker compose -f infra/judge0/docker-compose.yml up -d
docker compose up --build -d
```

### 3. Stop

```bash
bash infra/scripts/stop.sh
```

### 4. Reset (removes volumes)

```bash
bash infra/scripts/reset.sh
```

## MVP language targets (course support)

C, C++, C#, Python, Java
