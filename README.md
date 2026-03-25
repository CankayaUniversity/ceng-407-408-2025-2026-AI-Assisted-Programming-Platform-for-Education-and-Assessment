# AI-Assisted Programming Platform for Education and Assessment

Web platform for programming courses with AI-assisted hints (mentor role), secure code execution, and instructor tooling.

## Quick start (Docker)

From the **repository root** (Docker Desktop running):

1. Copy env files: `cp .env.example .env` and (for Judge0) `cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf`
2. Start Judge0 + app stack: `npm run up:all`
3. Wait until the backend container finishes migrations (first boot applies `prisma migrate deploy` automatically).
4. Load demo data: `npm run setup` (runs migrate again — safe — and seed)
5. Sanity check the API: `npm run smoke`

Services: API `http://localhost:5000`, Postgres `5432`, Ollama `11434`, Open WebUI `8080`, Judge0 `2358` (if you used `up:all`). Set `JUDGE0_URL` in `.env` (e.g. `http://host.docker.internal:2358` when the API runs in Docker and Judge0 on the host).

Stop: `npm run down:all`

## Repository layout

```
├── package.json           → Root npm scripts (Docker + smoke test)
├── scripts/               → smoke-test.mjs
├── frontend/              → React frontend (scaffold / future UI)
├── backend/               → Node.js / Express API + Prisma
├── infra/
│   ├── judge0/            → Judge0 stack (separate compose)
│   │   ├── docker-compose.yml
│   │   └── judge0.conf.example   (copy to judge0.conf; gitignored secrets)
│   └── scripts/           → Helper scripts (start / stop / reset)
├── docs/                  → Project notes, checklists, AI stack notes
├── model/                 → Ollama `Modelfile` for the mentor model
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

### Auth API (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` registers a user with `email`, `password`, `name`, and optional `role` (`student` or `teacher`). Roles must exist in the database (run seed). |
| POST | `/api/auth/login` body: `email`, `password` — returns `accessToken` and user profile. |
| GET | `/api/auth/me` header: `Authorization: Bearer <token>` — returns the current user. |

Set `JWT_SECRET` in `.env` for non-development environments.

### Problems API (`/api/problems`)

Requires `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/problems` | List all problems (summary fields for the assignment list UI). |
| GET | `/api/problems/:id` | Problem detail with `starterCode`. Students receive only non-hidden test cases plus `hiddenTestCaseCount`. Teachers receive `referenceSolution` and all test cases with `isHidden`. |

### AI mentor (`/api/ai`)

Requires `Authorization: Bearer <token>`. The API calls **Ollama** directly (`OLLAMA_BASE_URL`, default `http://localhost:11434`). Configure **`OLLAMA_MODEL`** (default `ai-mentor`) to match a model you created with `ollama create` (see `model/Modelfile`). Open WebUI in Docker is optional and used only as a separate UI to talk to the same models.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/chat` | JSON body: optional `problemId` (if set and valid, interaction is stored in `AiLog`), plus mentor fields such as `assignmentText`, `studentCode`, `studentQuestion`, `runStatus`, `stdout`, `errorMessage`, `language`, `mode`, `hintLevel`. Returns `{ success, mentorReply }` or `503` with `error` if Ollama is unreachable. |

### Code execution (`/api/execute`)

Requires `Authorization: Bearer <token>`. Uses **Judge0** at `JUDGE0_URL` (see `.env.example`).

**POST `/api/execute`** JSON body:

- **Tests mode:** `problemId` (required) + `sourceCode`. Optional `languageId` overrides the problem’s language tag. Runs every stored test case (hidden included). Response: `mode: "tests"`, `allPassed`, `results[]` (response obeys role/hidden rules), and **`submissionId`** after persisting a **`Submission`** row (`status` `accepted` or `failed`, full Judge0 outputs in DB for audit; aggregated `stdout` may be truncated at 50k chars).
- **Raw mode (terminal-style):** omit `problemId`, send `sourceCode`, `languageId`, and optional `stdin`. Response: `mode: "raw"` with full `stdout`, `stderr`, `compileOutput`, `status`, `time`, `memory`.

`503` if Judge0 is unreachable. Problems must ship **Judge0-runnable** programs (full stdin/stdout solutions); function-only snippets need a harness or a different grader strategy. The bundled `prisma/seed.ts` demo problems use **Node.js** (`fs.readFileSync(0)` for stdin) so they match Judge0’s JavaScript runner.

## Setup (detailed)

Equivalent to **Quick start**: `npm run up:all` then `npm run setup` then `npm run smoke`.

### 1. Environment files

```bash
cp .env.example .env
cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf
```

### 2. Start stacks

```bash
npm run up:all
```

Or with shell scripts:

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
