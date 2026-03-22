# Integration Test Checklist

## Auth
- [ ] login with valid seeded student user returns success
- [ ] login with valid seeded teacher user returns success
- [ ] invalid password returns error

## Problems
- [ ] problem list can be fetched from database
- [ ] problem detail can be fetched by id
- [ ] hidden test cases are not exposed to frontend response

## Submission
- [ ] run result can be stored in Submission table
- [ ] failed run can also be logged
- [ ] submission history can be queried by userId + problemId

## AI Logs
- [ ] AI hint response can be stored in AiLog table
- [ ] promptVersion, modelName, mode, timestamp are persisted
- [ ] AI interaction history can be queried by userId + problemId

## System Flags
- [ ] exam_mode_enabled can be read from SystemFlag
- [ ] exam_mode_enabled can be updated