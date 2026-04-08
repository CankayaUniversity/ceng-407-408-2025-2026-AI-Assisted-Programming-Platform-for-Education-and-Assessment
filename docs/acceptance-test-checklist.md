# Acceptance Test Checklist

## Goal
Verify the platform from a user-flow perspective rather than only route/database correctness.

---

## A. Student Flow

### 1. Student logs in
- [ ] student enters demo credentials
- [ ] system logs in successfully
- [ ] student workspace opens

### 2. Student views problem list
- [ ] problems are listed
- [ ] problem titles and difficulty are visible

### 3. Student opens a problem
- [ ] problem description is shown
- [ ] starter code is shown if available
- [ ] hidden test case content is not shown

### 4. Student runs code in raw mode
- [ ] backend accepts request
- [ ] result is shown to student
- [ ] raw run is logged as `SubmissionAttempt`

### 5. Student runs tests for a problem
- [ ] backend evaluates against test cases
- [ ] public results are shown
- [ ] hidden output is not exposed
- [ ] `Submission` and `SubmissionAttempt` are created

### 6. Student makes multiple attempts
- [ ] multiple attempt history exists
- [ ] accepted and failed attempts can both be tracked

### 7. Student asks AI for help
- [ ] mentor reply is returned
- [ ] request/response is logged in `AiLog`
- [ ] hint usage is logged in `HintEvent`
- [ ] audit record is created in `AIInteractionAudit`

### 8. Student asks repeated hints
- [ ] sequence number increases for the same problem
- [ ] hint chain is trackable

---

## B. Teacher/Data Perspective

### 9. Problem metadata exists
- [ ] problems are categorized/tagged in the database
- [ ] metadata exists for future grouping/recommendation

### 10. Attempt history exists for analytics
- [ ] test attempts exist with pass counts and statuses
- [ ] raw attempts exist
- [ ] normalized statuses are available

### 11. Help dependency data exists
- [ ] hint events exist
- [ ] sequence values exist

### 12. AI audit data exists
- [ ] mentor model is stored
- [ ] policy action is stored
- [ ] final text is stored
- [ ] latency is stored

---

## C. System/Mode Behavior

### 13. Exam mode flag exists
- [ ] `exam_mode_enabled` is present in DB
- [ ] flag can be read by backend logic

### 14. Error handling is understandable
- [ ] login errors return clear messages
- [ ] execute errors return clear messages
- [ ] AI errors return clear messages

---

## D. Demo Readiness

### 15. Seed demo data is realistic
- [ ] multiple problems exist
- [ ] multiple attempts exist
- [ ] multiple hint interactions exist
- [ ] multiple audit entries exist

### 16. Known runtime issues are separated correctly
- [ ] DB/schema integration issues are not confused with Judge0 infra issues
- [ ] Judge0 sandbox problems are documented separately if present