
---

## 2) `docs/integration-test-checklist.md`

```md
# Integration Test Checklist

## Auth
- [ ] login with valid seeded student user returns success
- [ ] login with valid seeded teacher user returns success
- [ ] login with valid seeded admin user returns success
- [ ] invalid password returns error
- [ ] invalid email returns error

## Problems
- [ ] problem list can be fetched from database
- [ ] problem detail can be fetched by id
- [ ] seeded problems are returned correctly
- [ ] hidden test cases are not exposed to frontend response

## Submission
- [ ] run result can be stored in Submission table
- [ ] accepted run can be logged
- [ ] failed run can also be logged
- [ ] submission history can be queried by userId + problemId
- [ ] submission records are sorted correctly by createdAt

## AI Logs
- [ ] AI hint response can be stored in AiLog table
- [ ] promptVersion is persisted
- [ ] modelName is persisted
- [ ] mode is persisted
- [ ] timestamp is persisted
- [ ] AI interaction history can be queried by userId + problemId

## System Flags
- [ ] exam_mode_enabled can be read from SystemFlag
- [ ] exam_mode_enabled can be updated

## Seed / Startup
- [ ] migrations run successfully on a clean database
- [ ] seed runs successfully on a clean database
- [ ] seeded users exist after seeding
- [ ] seeded problems exist after seeding