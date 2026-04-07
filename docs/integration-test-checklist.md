# Integration Test Checklist

## Goal
Verify that backend routes and database writes are correctly integrated.

---

## A. Auth Integration

### 1. Seeded student login
- [ ] POST `/api/auth/login` with `student1@demo.com / 123456`
- [ ] access token is returned
- [ ] user role is `student`

### 2. Seeded teacher login
- [ ] POST `/api/auth/login` with `teacher1@demo.com / 123456`
- [ ] access token is returned
- [ ] user role is `teacher`

### 3. Auth me endpoint
- [ ] GET `/api/auth/me` with valid token
- [ ] correct user profile is returned

---

## B. Problem Integration

### 4. Problem list
- [ ] GET `/api/problems`
- [ ] seeded problems are returned

### 5. Student problem detail
- [ ] GET `/api/problems/:id` as student
- [ ] only public test cases are returned
- [ ] hidden test case contents are not exposed

### 6. Teacher problem detail
- [ ] GET `/api/problems/:id` as teacher
- [ ] hidden test cases are visible
- [ ] reference solution is visible if teacher route allows it

### 7. Problem metadata presence
- [ ] seeded problems contain tags/category/metadata in database
- [ ] backend can read them without schema/runtime issues

---

## C. Execute Integration

### 8. Raw execute request reaches backend
- [ ] POST `/api/execute` in raw mode
- [ ] backend returns response without validation errors

### 9. Raw execute logs SubmissionAttempt
- [ ] raw execute creates `SubmissionAttempt`
- [ ] mode = `raw`
- [ ] sourceCode stored
- [ ] normalizedStatus stored

### 10. Test execute request reaches backend
- [ ] POST `/api/execute` with `problemId`
- [ ] backend reads problem and test cases

### 11. Test execute logs Submission
- [ ] test mode creates `Submission`

### 12. Test execute logs SubmissionAttempt
- [ ] test mode creates `SubmissionAttempt`
- [ ] mode = `tests`
- [ ] submissionId is linked
- [ ] publicPassed/publicTotal stored
- [ ] hiddenPassed/hiddenTotal stored
- [ ] allPassed stored

### 13. Failed test execution
- [ ] wrong answer or compile error path creates `SubmissionAttempt`
- [ ] normalizedStatus is not `accepted`

---

## D. AI Integration

### 14. AI chat basic success
- [ ] POST `/api/ai/chat`
- [ ] mentor reply is returned on success

### 15. AiLog creation
- [ ] AI chat creates `AiLog`
- [ ] userId/problemId stored
- [ ] promptVersion and modelName stored

### 16. HintEvent creation
- [ ] AI chat creates `HintEvent`
- [ ] sequence is assigned
- [ ] aiLogId is linked

### 17. AIInteractionAudit creation
- [ ] AI chat creates `AIInteractionAudit`
- [ ] mentorModel stored
- [ ] policyAction stored
- [ ] finalText stored
- [ ] latencyMsMentor stored

### 18. AI error path audit
- [ ] if mentor fails, error response is returned
- [ ] audit record still exists with errorCode if problem context exists

---

## E. Seed Integration

### 19. Seed users
- [ ] teacher/student/admin are created

### 20. Seed problems
- [ ] 3 demo problems exist
- [ ] each problem has public + hidden test cases

### 21. Seed attempts
- [ ] `SubmissionAttempt` records exist
- [ ] both raw and tests examples exist
- [ ] accepted and non-accepted examples exist

### 22. Seed AI data
- [ ] `AiLog` records exist
- [ ] `HintEvent` records exist
- [ ] `AIInteractionAudit` records exist

### 23. Seed system flag
- [ ] `exam_mode_enabled` exists in `SystemFlag`

---

## F. Infra/Runtime Note

### 24. Judge0 runtime
- [ ] backend can reach Judge0
- [ ] if execution fails, determine whether problem is:
  - route/DB integration issue
  - Judge0 runtime/sandbox issue
- [ ] document sandbox/cgroup problems separately from backend schema work