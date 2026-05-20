# Mentor test runner

Automated end-to-end test of the AI mentor. Reads scenarios from
`mentor-scenarios.yaml`, calls the debug endpoint for each one, evaluates
pass/fail, and writes a Markdown + JSON report to `test-reports/`.

## One-time setup on the server

Add this env var to the backend service in `docker-compose.yml`:

```yaml
environment:
  - AI_DEBUG_ENABLED=true   # ONLY enable on dev/staging; never in production
```

Then rebuild the backend:

```bash
docker compose up -d --build backend
```

Verify the debug route is reachable (it returns 404 unless the env var is on):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://localhost:5000/api/ai/chat/debug \
  -H "Content-Type: application/json" -d '{}'
# Expect: 401 (auth required), NOT 404
```

## Running

```bash
# Get an auth token (use any teacher account)
export AUTH_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"teacher123"}' \
  | jq -r .token)

# Run all scenarios
cd backend && npm run test:mentor

# Run a subset by name substring
TEST_FILTER=en-          npm run test:mentor    # English only
TEST_FILTER=tr-          npm run test:mentor    # Turkish only
TEST_FILTER=hint         npm run test:mentor    # hint-mode scenarios
TEST_FILTER=solution     npm run test:mentor    # solution-request scenarios
```

Output goes to `test-reports/mentor-YYYY-MM-DDTHH-MM-SS.md` and `.json`.

## Report layout

Each scenario block shows:
- The exact question sent.
- Detected intent and locale.
- Validator decision + violations + source.
- Policy action + rewrite count.
- Quality flags.
- Per-stage latency.
- **Raw mentor output** (before any cleanup or policy).
- **Final text shown to student** (what the chat bubble would render).
- Any assertion failures.

Paste the Markdown to whoever is iterating on the prompts/validator.

## Safety

The `/api/ai/chat/debug` endpoint:
- Returns **404** unless `AI_DEBUG_ENABLED=true` is set in the env.
- Still requires auth (`requireAuth` middleware applies to all `/api/ai/*`).
- Does NOT write to `AiInteractionLog`, `HintEvent`, or any audit table.
- Is **not** used by the frontend — only the test script.

Never set `AI_DEBUG_ENABLED=true` in production. The endpoint returns the
full system prompt, which is internal and not meant for end users.
