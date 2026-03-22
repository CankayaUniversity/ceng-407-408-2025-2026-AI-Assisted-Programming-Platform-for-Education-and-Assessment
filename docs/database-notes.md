# Database Notes

## Current Database Scope

The current database schema includes the following tables:

- Role
- User
- Problem
- TestCase
- Submission
- AiLog
- SystemFlag

This schema is designed to support the first MVP of the AI-assisted programming platform.

---

## Seeded Data

The database is seeded with:

- 3 roles:
  - student
  - teacher
  - admin

- 3 users:
  - student1@demo.com
  - teacher1@demo.com
  - admin1@demo.com

- 3 sample problems:
  - Sum of Two Numbers
  - Check Palindrome
  - Factorial

- related test cases
- 1 sample submission
- 1 sample AI log
- 1 system flag:
  - exam_mode_enabled

---

## Submission History Query

Get a student's submission history for a specific problem:

```ts
const history = await prisma.submission.findMany({
  where: {
    userId: studentId,
    problemId: problemId,
  },
  orderBy: {
    createdAt: "desc",
  },
});