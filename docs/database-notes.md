## Submission History Query

Get a student's submission history for a problem:

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
```md
### Planned endpoint
GET /api/v1/student/history?problemId=...

Returns:
- submission attempts
- latest first
- can later be extended with AI logs

## AI Log History Query

Get AI hint history for a student on a problem:

```ts
const aiHistory = await prisma.aiLog.findMany({
  where: {
    userId: studentId,
    problemId: problemId,
  },
  orderBy: {
    createdAt: "desc",
  },
});


## 6.2 Hangi alanlar önemli


```md
Important logged fields:
- mode
- promptVersion
- modelName
- studentQuestion
- responseText
- requestPayload
- responsePayload
- createdAt