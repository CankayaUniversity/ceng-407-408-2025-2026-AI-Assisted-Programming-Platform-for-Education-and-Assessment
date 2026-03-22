# Backend - Database Mapping

## Auth

### POST /auth/login
Uses:
- User
- Role

Expected behavior:
- check email
- verify password hash
- return user info / token logic from backend layer

---

## Problems

### GET /problems
Uses:
- Problem

Expected response fields:
- id
- title
- difficulty
- language
- createdAt

### GET /problems/:id
Uses:
- Problem
- TestCase

Expected response fields:
- id
- title
- description
- starterCode
- difficulty
- language

Important rule:
- hidden test cases should not be returned to frontend

---

## Execute

### POST /execute
Uses:
- Submission

Expected DB write:
- userId
- problemId
- code
- language
- status
- stdout
- stderr
- executionTime
- memory
- createdAt

Purpose:
- persist run/submission attempts
- provide base for submission history

---

## Student History

### GET /student/history
Uses:
- Submission

Suggested query:
- filter by userId
- optionally filter by problemId
- order by createdAt desc

Purpose:
- show previous attempts
- support MVP history without requiring a separate snapshot table

---

## AI Hint

### POST /ai/hint
Uses:
- AiLog

Expected DB write:
- userId
- problemId
- submissionId (optional)
- mode
- promptVersion
- modelName
- studentQuestion
- responseText
- requestPayload
- responsePayload
- createdAt

Purpose:
- persist AI interaction history
- support later audit/history needs

---

## AI History

### GET /student/history/ai
Uses:
- AiLog

Suggested query:
- filter by userId
- optionally filter by problemId
- order by createdAt desc

Purpose:
- show previous AI help requests and responses

---

## Admin

### PATCH /admin/exam-mode
Uses:
- SystemFlag

Flag used:
- exam_mode_enabled

Purpose:
- allow backend/admin logic to change system behavior during exam mode