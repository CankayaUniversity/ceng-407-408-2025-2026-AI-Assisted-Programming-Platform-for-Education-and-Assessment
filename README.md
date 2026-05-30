# AI-Assisted Programming Platform for Education and Assessment

Web platform for programming courses with teacher/student workflows, AI-assisted mentoring, secure code execution, grading support, analytics, and personalized flashcards.

## Project overview

The platform is designed for programming education. Teachers can create problems, assignments, rubrics, and AI-generated problem variations. Students can solve assigned programming tasks in a browser-based coding workspace, run code, submit solutions against test cases, receive mentor-style AI help, review grades and teacher feedback, track analytics, and study personalized flashcards generated from their own attempts.

## Core stack

- Frontend: React + Vite + Material UI
- Code editor and terminal UI: Monaco Editor + xterm.js
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Authentication: JWT access tokens and refresh tokens
- AI runtime: Ollama, using `qwen2.5-coder:14b` as the primary local mentor model
- Code execution: Docker-based language runner containers
- Deployment target: single Google Cloud server with Docker Compose

## Main features

- Student workspace with problem statement, code editor, run/submit flow, terminal output, and AI Mentor chat
- Teacher question bank for creating and managing programming problems
- Assignment management with student enrollment
- Rubric generation and teacher-controlled grading
- AI-assisted grade suggestions based on rubric criteria and latest submissions
- AI-generated problem variations for teacher review
- Student analytics and teacher class analytics
- Personalized flashcards generated after accepted submissions
- Exam mode controls and violation tracking
- Tutorial content for supported programming topics

## Supported languages

| Language | Run | Submit with test cases |
|----------|-----|------------------------|
| Python | Yes | Yes |
| C | Yes | Yes |
| C++ | Yes | Yes |
| C# | Yes | Yes |
| JavaScript | Yes | Yes |
| Java | Yes | Yes |

## Running the project

Create an environment file from the example:

```bash
cp .env.example .env
```

For the current Docker deployment:

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

Stop the stack:

```bash
docker compose down
```

Useful commands:

```bash
# backend logs
docker compose logs -f backend

# run database migrations
npm run db:migrate

# seed demo data
npm run db:seed

# smoke test the backend API
npm run smoke
```

Note: older root npm scripts such as `up:judge0`, `down:judge0`, and `up:all` reference a removed `infra/judge0` folder and should not be used unless that legacy Judge0 stack is restored.

## URLs

Production/server Docker deployment:

- Frontend: `https://<server-domain>` or the server IP/domain configured for nginx
- Backend API through nginx: `https://<server-domain>/api`
- Backend health through nginx: `https://<server-domain>/health`
- Backend direct port: `http://<server-ip>:5000`
- Ollama direct port: `http://<server-ip>:11434`

Local Vite development:

- Frontend dev server: `http://localhost:5173`
- Backend API: `http://localhost:5000`
- Backend readiness: `http://localhost:5000/api/health/ready`

The built frontend uses same-origin API calls. In Docker, nginx proxies `/api/*` and `/ws/*` to the backend container, so the frontend does not need a separate `VITE_API_BASE_URL` in the production image.

## Code execution architecture

The project currently uses a Docker-based runner instead of a live Judge0 service.

Both the interactive terminal path and the submit/test-case path execute student code inside short-lived Docker containers. The backend writes code into a shared temporary directory, asks the host Docker daemon to start a language-specific runner container, passes stdin to the process, and captures stdout, stderr, exit status, and timing information.

Security and resource boundaries include:

- no outbound network access for runner containers
- dropped Linux capabilities
- `no-new-privileges`
- memory limit
- CPU limit
- process count limit
- temporary writable scratch space
- per-run timeout handling

Some internal names still use Judge0-compatible terminology, such as `Judge0RunResult`, `languageId`, `judge0Status`, and `judge0StatusId`. These are legacy compatibility names for result/status mapping; the current execution path is the local Docker runner.

## AI architecture

The AI features run through Ollama. The main model is configured with:

```env
OLLAMA_MODEL=qwen2.5-coder:14b
```

The AI Mentor is designed to guide students without simply giving away complete answers. It uses prompt rules, assignment/problem context, student code, terminal output, and safety filtering to produce mentor-style responses.

AI is also used for:

- personalized flashcard generation
- rubric generation
- grade suggestion support
- problem variation generation
- tutorial generation/caching support

The current mentor flow does not rely on a separate validator model. If legacy validator-related environment variables or database fields are present, they are retained for compatibility/audit history and are not the main AI mentor architecture.

## Key API endpoints

- Auth: `/api/auth/register`, `/api/auth/verify-email`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/me`
- Problems: `/api/problems`, `/api/problems/:id`
- AI mentor: `/api/ai/chat`, `/api/ai/chat/stream`, `/api/ai/hint`
- Code execution: `/api/execute`
- Student history and analytics: `/api/student/history`, `/api/student/history/ai`, `/api/student/analytics`
- Teacher views: `/api/teacher/students`, `/api/teacher/class/overview`, `/api/teacher/class/analytics`
- Assignments: `/api/assignments`, `/api/assignments/:id`, `/api/assignments/:id/enroll`
- Grades: `/api/grades/me/assignment/:assignmentId`, `/api/grades/assignment/:assignmentId`, `/api/grades/:assignmentId/:userId`
- Rubrics: `/api/rubrics/:problemId`, `/api/rubrics/:problemId/generate`
- Flashcards: `/api/flashcards/library`, `/api/flashcards/status`, `/api/flashcards/generate`
- Variations: `/api/variations/generate`, `/api/variations`, `/api/variations/:id`
- Tutorials: `/api/tutorials/index/:language`, `/api/tutorials/:tag/:language`
- Exam mode: `/api/admin/exam-mode`, `/api/exam/violation`, `/api/exam/status/:assignmentId`
- Health: `/health`, `/api/health`, `/api/health/live`, `/api/health/ready`

## Repository structure

```text
backend/      Express API, Prisma schema, AI services, Docker runner, routes
frontend/     React/Vite application, student and teacher UI
docs/         Technical notes, checklists, and validation documents
Documents/    Project delivery documents
infra/        Infrastructure helper scripts
model/        Model-related project files, if present
scripts/      Utility scripts such as API smoke tests
```

The `Documents` folder is organized by course phase:

```text
Documents/407/    CENG 407 documents
Documents/408/    CENG 408 documents
```

## Verification checklist

- Backend health endpoint returns `ok`
- Login works for demo student and teacher accounts
- Problem list loads
- Student can open an assignment and reach the coding workspace
- `Run` returns terminal output or execution errors
- `Submit` runs test cases and records the submission
- AI Mentor returns guidance without directly giving complete solutions
- Flashcards can be generated after accepted submissions
- Teacher can create assignments, rubrics, and grades
- Student can view grade and teacher feedback
- Exam mode disables restricted features for students

## Deployment notes

The current Docker Compose file is production-oriented:

- frontend is served by nginx on ports `80` and `443`
- backend is exposed on port `5000`
- PostgreSQL is exposed on port `5432`
- Ollama is exposed on port `11434`
- nginx expects Let's Encrypt certificates under `/etc/letsencrypt`
- GPU support is requested for the Ollama container through the NVIDIA Docker runtime
- backend uses the host Docker socket to start isolated language runner containers

For a fresh local machine, certificate and GPU settings may need adjustment before using the production Compose file unchanged.

## Incident quick actions

```bash
# restart backend
docker compose restart backend

# restart frontend
docker compose restart frontend

# full restart
docker compose down
docker compose up -d --build

# re-run migrations and seed data
npm run setup
```

## Manual rollback

If deployment fails:

1. Checkout the last known good commit or tag.
2. Rebuild and restart the stack.
3. Re-run migrations only if the target commit requires them.
4. Verify health, login, problem loading, run/submit, AI Mentor, and grading flows.
