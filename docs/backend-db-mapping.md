# Backend ↔ Database Mapping

## Overview

This document maps the current backend routes and backend behavior to database tables.

The mapping now reflects the expanded event-oriented schema:
- `Submission`
- `SubmissionAttempt`
- `AiLog`
- `HintEvent`
- `AIInteractionAudit`
- `SystemFlag`

---

## 1. Auth Routes

### `POST /api/auth/register`
Writes:
- `User`

Reads:
- `Role`

### `POST /api/auth/login`
Reads:
- `User`
- `Role`

### `GET /api/auth/me`
Reads:
- `User`
- `Role`

---

## 2. Problem Routes

### `GET /api/problems`
Reads:
- `Problem`

Returned fields:
- id
- title
- description
- difficulty
- language
- createdAt

Future optional fields:
- tags
- category
- metadata

### `GET /api/problems/:id`
Reads:
- `Problem`
- `TestCase`

Role behavior:
- student: only public test cases are returned
- teacher: full test case data and reference solution can be returned

Important:
- hidden test case contents must never be exposed to students

---

## 3. Execute Route

### `POST /api/execute`

#### Raw Run Mode
Condition:
- request includes `languageId`
- request does not include `problemId`

Writes:
- `SubmissionAttempt`

Typical fields:
- mode = `raw`
- userId
- sourceCode
- language
- judge0Status
- normalizedStatus
- stdout/stderr/compileOutput
- executionTimeMs
- memoryKb

#### Test Run Mode
Condition:
- request includes `problemId`

Reads:
- `Problem`
- `TestCase`

Writes:
- `Submission`
- `SubmissionAttempt`

`Submission` role:
- higher-level record of the test submission

`SubmissionAttempt` role:
- detailed execution/event record

Typical test-mode attempt fields:
- mode = `tests`
- userId
- problemId
- submissionId
- sourceCode
- normalizedStatus
- publicPassed/publicTotal
- hiddenPassed/hiddenTotal
- allPassed
- stdout/stderr/compileOutput
- executionTimeMs
- memoryKb

Important:
- student-facing response must redact hidden test output details

---

## 4. AI Route

### `POST /api/ai/chat`

Reads:
- optional `Problem`
- optional `Submission` context from request payload

Writes:
- `AiLog`
- `HintEvent`
- `AIInteractionAudit`

#### AiLog
Purpose:
- record the user question and AI response

Typical fields:
- userId
- problemId
- optional submissionId
- mode
- promptVersion
- modelName
- studentQuestion
- responseText
- requestPayload

#### HintEvent
Purpose:
- count and sequence hint usage per student/problem

Typical fields:
- userId
- problemId
- optional attemptId
- optional aiLogId
- sequence

#### AIInteractionAudit
Purpose:
- keep an audit-oriented record of the AI pipeline

Typical fields:
- userId
- problemId
- optional attemptId
- mentorModel
- validatorModel
- mentorRaw
- validatorJson
- policyAction
- finalText
- rewriteCount
- latencyMsMentor
- latencyMsValidator
- errorCode

Current implementation notes:
- validator fields may be null for now
- policyAction is currently simple (`allow` / error path)
- audit exists now so future validator/policy integration can plug in cleanly

---

## 5. System Flags

### `PATCH /api/admin/exam-mode` or equivalent future admin route
Reads/Writes:
- `SystemFlag`

Current key:
- `exam_mode_enabled`

Purpose:
- keep exam mode state centralized in DB

---

## 6. Student History Data Sources

### Basic/Legacy View
Can still read from:
- `Submission`

### Preferred Detailed History
Should read from:
- `SubmissionAttempt`

Because `SubmissionAttempt` stores:
- raw vs tests mode
- normalized status
- full execution detail
- timing/memory
- pass counts

---

## 7. AI History Data Sources

### User-facing AI history
Can read from:
- `AiLog`

### Audit/debug history
Should read from:
- `AIInteractionAudit`

### Help dependency analytics
Should read from:
- `HintEvent`

---

## 8. Teacher Analytics Data Sources

### A — Solution success
Use:
- `SubmissionAttempt`
- fields like `allPassed`, `publicPassed`, `hiddenPassed`, `normalizedStatus`

### B — Process quality
Use:
- `SubmissionAttempt`
- attempt counts
- time ordering
- change across attempts

### C — Error profile
Use:
- `SubmissionAttempt.normalizedStatus`

### D — Help dependency
Use:
- `HintEvent`
- optional relation to attempts
- sequence values

### E — Code quality
Future source:
- planned code quality snapshot table or analysis job

### F — Learning trend
Use:
- `Problem.tags`
- `Problem.category`
- `Problem.metadata`
- `SubmissionAttempt` timeline

---

## Short Summary

Main mapping direction:
- execute → `Submission` + `SubmissionAttempt`
- ai/chat → `AiLog` + `HintEvent` + `AIInteractionAudit`
- student history → mainly `SubmissionAttempt`
- teacher analytics → attempts + hints + problem metadata