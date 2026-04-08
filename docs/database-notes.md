# Database Notes

## Current Database Direction

The database layer is no longer limited to only `Submission` and `AiLog` for tracking user activity.  
The updated schema now supports a more event-oriented structure for execution history, hint usage, AI auditing, and future analytics.

## Core Tables

### Existing Core Tables
- `Role`
- `User`
- `Problem`
- `TestCase`
- `Submission`
- `AiLog`
- `SystemFlag`

### Newly Added Tables
- `SubmissionAttempt`
- `HintEvent`
- `AIInteractionAudit`

### Problem Metadata Expansion
`Problem` now also includes:
- `tags`
- `category`
- `metadata`

---

## Table Responsibilities

### Submission
`Submission` is kept as a higher-level record for problem-based code submissions.  
It can still be used as a summary/final record for a problem attempt flow.

Typical use:
- keep accepted/failed submission records
- preserve older endpoint compatibility
- support simpler student history views if needed

### SubmissionAttempt
`SubmissionAttempt` is now the main detailed execution/history table.

It stores:
- raw run vs tests mode
- normalized execution status
- source code
- judge status
- public/hidden pass counts
- stdout/stderr/compile output
- execution time and memory
- optional relation to a `Submission`

This table should be considered the main source for:
- execution history
- attempt timeline
- process quality analytics
- error profile analytics

### AiLog
`AiLog` is kept as the direct record of an AI interaction request/response pair.

It stores:
- user
- problem
- optional submission
- mode
- prompt version
- model name
- student question
- response text
- request/response payload

### HintEvent
`HintEvent` is used to track hint usage separately from raw AI logs.

It stores:
- user
- problem
- optional attempt
- optional AiLog link
- sequence number for that user/problem

This table is useful for:
- hint count
- hint streaks
- help dependency metrics
- hint-after-attempt analysis

### AIInteractionAudit
`AIInteractionAudit` is the audit-oriented table for the AI pipeline.

It stores:
- user
- problem
- optional attempt
- mentor model
- optional validator model
- mentor raw text
- optional validator JSON
- policy action
- final text shown to user
- rewrite count
- mentor/validator latency
- optional error code

This table is the main source for:
- AI pipeline traceability
- future validator integration
- policy auditing
- debugging unsafe or blocked outputs

### Problem Metadata Fields
The `Problem` table now includes:
- `tags`: topic and grouping support
- `category`: broad grouping
- `metadata`: flexible JSON for future use

These fields are intended to support:
- learning trend analysis
- topic-based grouping
- similar problem recommendations
- teacher analytics by category/tag

---

## Current Runtime Status

### Working
- backend starts successfully
- login works against seeded database
- Prisma migrations and seed work
- `/api/execute` route is wired to `SubmissionAttempt`
- `/api/ai/chat` route is wired to `AiLog`, `HintEvent`, and `AIInteractionAudit`

### Known External Runtime Issue
Judge0 is reachable, but code execution currently hits a sandbox/cgroup runtime issue in the Judge0 worker environment.  
This is an infrastructure/runtime issue, not a schema design issue.

---

## Current Seed Coverage

The seed now includes:
- demo teacher, student, admin
- 3 demo problems
- public + hidden test cases
- multiple submissions
- multiple submission attempts
- multiple AI logs
- multiple hint events
- multiple AI interaction audit records
- problem tags/category/metadata
- exam mode flag

This allows more realistic backend and analytics testing than the earlier minimal seed.

---

## Design Notes

### Why keep both Submission and SubmissionAttempt?
Because they serve different levels of abstraction:
- `Submission` = higher-level record / compatibility / summary
- `SubmissionAttempt` = detailed event history

### Why separate HintEvent from AiLog?
Because not every AI interaction should be treated analytically the same way.  
A dedicated hint table makes help usage analysis cleaner.

### Why add AIInteractionAudit if AiLog already exists?
Because `AiLog` is request/response oriented, while `AIInteractionAudit` is pipeline/audit oriented.

`AiLog` answers:
- what did the user ask?
- what did the assistant answer?

`AIInteractionAudit` answers:
- what model produced it?
- what policy action happened?
- what final text was shown?
- was there an error?
- what was the latency?

---

## Short Summary

The database now supports:
- execution attempts
- hint chains
- AI pipeline auditing
- tagged problems for future analytics

This is much closer to the final intended platform design than the original simpler schema.