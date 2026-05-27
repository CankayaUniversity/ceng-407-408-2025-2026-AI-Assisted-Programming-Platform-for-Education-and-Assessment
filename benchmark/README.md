# Local AI Mentor Benchmark

Run from the repository root:

```bash
python3 benchmark/run_benchmark.py
```

The benchmark sends the structured cases in `benchmark/prompts.json` to the models in `benchmark/config.json`.
By default it runs both `raw_ollama` and `backend_mentor` modes, then runs the platform/API benchmark
cases configured in `benchmark/config.json`.

For `backend_mentor`, start the backend with model override enabled and provide a student auth token:

```bash
ALLOW_AI_MODEL_OVERRIDE=true npm run dev
BENCHMARK_AUTH_TOKEN=<jwt> python3 benchmark/run_benchmark.py
```

Without `BENCHMARK_AUTH_TOKEN`, backend rows are recorded as `backend_auth_token_missing`; raw Ollama rows still run.
If `BENCHMARK_AUTH_TOKEN` is not provided, the runner tries to log in with the seeded student account
(`student1@demo.com / 123456`). Teacher/platform cases use `teacher1@demo.com / 123456` by default.

Optional environment variables:

```bash
BENCHMARK_BACKEND_URL=http://localhost:5000
BENCHMARK_STUDENT_EMAIL=student1@demo.com
BENCHMARK_STUDENT_PASSWORD=123456
BENCHMARK_TEACHER_EMAIL=teacher1@demo.com
BENCHMARK_TEACHER_PASSWORD=123456
```

Outputs:

```text
benchmark/results/metrics.csv
benchmark/results/responses.jsonl
benchmark/results/platform_metrics.csv
benchmark/results/platform_responses.jsonl
benchmark/results/benchmark_report.md
benchmark/results/graphs/*.svg
```

The report includes:

- classic general LLM benchmark table (MMLU-Pro, BBH, GSM8K/MATH, TruthfulQA, IFEval, LongBench/RULER)
- classic coding benchmark table (HumanEval+, MBPP+, LiveCodeBench, CRUXEval, QuixBugs/BugsInPy, SWE-bench)
- custom AI mentor tables for safety, hint progression, context awareness, language handling, typo robustness, exam mode, and regressions
- platform/API tables for auth, backend readiness, execution, analytics, and security/isolation
- weighted model ranking where mentor quality and no-solution-leak behavior matter more than raw speed
- SVG graphs for model latency, safety pass rate, language pass rate, tokens/sec, weighted scores, platform latency, and risk flags
