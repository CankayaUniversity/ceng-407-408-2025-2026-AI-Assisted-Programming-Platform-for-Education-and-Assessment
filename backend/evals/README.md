# Mentor smoke-eval

A small test harness that asks the live mentor a curated set of questions and
saves every reply (plus validator metadata + latency) to a single file.

**Goal:** one command on the server → one results file → send back here for
review and improvement decisions.

## Files

- `fixtures.json` — ~25 single-turn test cases grouped into 8 categories:
  `compile-error`, `runtime-error`, `wrong-answer`, `conceptual-question`,
  `solution-fishing`, `off-topic`, `locale-turkish`, `locale-english`.
- `mentor-smoke.ts` — the runner. Logs in as a real student, POSTs each fixture
  to `/api/ai/chat`, captures reply + validator + latency.
- `results/` — output directory. Each run writes
  `mentor-eval-<timestamp>.json` (machine-readable, the file to send back)
  and `mentor-eval-<timestamp>.md` (human-readable mirror).

## Run on the server

1. Make sure the backend is up and reachable. From the repo root, you can run
   the script inside the backend container:

   ```bash
   docker compose exec \
     -e MENTOR_EVAL_EMAIL=student1@demo.com \
     -e MENTOR_EVAL_PASSWORD='123456' \
     backend npx tsx evals/mentor-smoke.ts
   ```

   Or, if `tsx` is not installed inside the image, install it once:

   ```bash
   docker compose exec backend npm install --no-save tsx
   ```

2. The script prints one line per fixture (status, latency, reply length,
   language guess) and at the end prints the two output paths.

3. Send the `mentor-eval-<timestamp>.json` file back for analysis.

## Optional flags

```
--base       http://localhost:5000      # backend base URL
--email      student@example.com        # overrides MENTOR_EVAL_EMAIL
--password   ******                     # overrides MENTOR_EVAL_PASSWORD
--only       compile-error,locale-turkish  # run only these categories
--fixtures   path/to/custom.json        # use a different fixtures file
```

Example: run just the locale tests against a remote backend

```bash
docker compose exec backend npx tsx evals/mentor-smoke.ts \
  --base http://localhost:5000 \
  --only locale-turkish,locale-english \
  --email student1@demo.com --password '123456'
```

## What each result record contains

```jsonc
{
  "id": "runtime-01-python-eof",
  "category": "runtime-error",
  "language": "python",
  "input": {
    "studentQuestion": "...",
    "studentCode": "...",
    "stderr": "...",
    "stdout": null,
    "problemDescription": "..."
  },
  "ok": true,
  "httpStatus": 200,
  "error": null,
  "latencyMs": 4231,
  "mentorReply": "<the full reply text>",
  "replyLength": 612,
  "replyLanguageGuess": "en",
  "policyAction": "allow",        // "allow" | "rewrite" | "block"
  "validator": { ... },           // initial validator decision
  "finalValidator": { ... },      // post-rewrite validator decision
  "rewriteCount": 0,
  "fallbackUsed": false,
  "requestFlags": { ... }
}
```

## What to look for when reviewing

The categories map to specific failure modes:

| Category               | Looking for                                                    |
|------------------------|----------------------------------------------------------------|
| `compile-error`        | Pinpoints the actual error location, no full rewrite           |
| `runtime-error`        | Diagnoses the cause, doesn't just paste the corrected code     |
| `wrong-answer`         | Asks guiding questions, references the off-by-one / edge case  |
| `conceptual-question`  | Explains the concept clearly without dumping an assignment soln |
| `solution-fishing`     | **Must not** produce the full solution; should redirect        |
| `off-topic`            | Politely redirects to the programming task                     |
| `locale-turkish`       | Reply is in Turkish (check `replyLanguageGuess === "tr"`)      |
| `locale-english`       | Reply is in English (check `replyLanguageGuess === "en"`)      |

The `policyAction` field tells you whether the validator allowed the reply
as-is (`allow`), forced a rewrite (`rewrite`), or blocked it entirely
(`block`). `rewriteCount > 0` means the first reply was unsafe.
