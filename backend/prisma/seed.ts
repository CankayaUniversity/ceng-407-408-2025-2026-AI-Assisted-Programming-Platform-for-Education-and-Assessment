import "dotenv/config";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { prisma, pgPool } from "../src/lib/prisma";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const SUM_DESCRIPTION =
  "Read two integers from standard input (one line, space-separated) and print their sum as a single line.";

/** Student editor starts empty; reference solution is teacher-only. */
const EMPTY_STARTER = "";

const SUM_REFERENCE = `line = input().strip()
a, b = map(int, line.split())
print(a + b)
`;

const PAL_DESCRIPTION =
  "Read one line from standard input and print true if it is a palindrome, otherwise false (lowercase booleans).";

const PAL_REFERENCE = `s = input().strip()
ok = s == s[::-1]
print(str(ok).lower())
`;

const FACT_DESCRIPTION =
  "Read a positive integer n from standard input and print n factorial (n!) on one line.";

const FACT_REFERENCE = `n = int(input().strip())
def fact(x: int) -> int:
    if x <= 1:
        return 1
    return x * fact(x - 1)

print(fact(n))
`;

type TestSpec = {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
};

async function upsertProblemWithTests(params: {
  title: string;
  description: string;
  starterCode: string;
  referenceSolution: string;
  difficulty: string;
  language: string;
  tags: string[];
  category?: string;
  metadata?: Record<string, unknown>;
  createdById: number;
  testCases: TestSpec[];
}) {
  const existing = await prisma.problem.findFirst({
    where: { title: params.title },
  });

  const common = {
    description: params.description,
    starterCode: params.starterCode,
    referenceSolution: params.referenceSolution,
    difficulty: params.difficulty,
    language: params.language,
    tags: params.tags,
    category: params.category ?? null,
    metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  if (existing) {
    await prisma.testCase.deleteMany({ where: { problemId: existing.id } });

    return prisma.problem.update({
      where: { id: existing.id },
      data: {
        ...common,
        testCases: {
          create: params.testCases.map((tc) => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
          })),
        },
      },
    });
  }

  return prisma.problem.create({
    data: {
      title: params.title,
      ...common,
      createdBy: { connect: { id: params.createdById } },
      testCases: {
        create: params.testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isHidden: tc.isHidden,
        })),
      },
    },
  });
}

async function resetDemoData() {
  await prisma.hintEvent.deleteMany();
  await prisma.aIInteractionAudit.deleteMany();
  await prisma.aiLog.deleteMany();
  await prisma.submissionAttempt.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.problem.deleteMany();
}

async function main() {
  const studentRole = await prisma.role.upsert({
    where: { name: "student" },
    update: {},
    create: { name: "student" },
  });

  const teacherRole = await prisma.role.upsert({
    where: { name: "teacher" },
    update: {},
    create: { name: "teacher" },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { name: "admin" },
  });

  const hashedPassword = await bcrypt.hash("123456", 10);

  const teacher = await prisma.user.upsert({
    where: { email: "teacher1@demo.com" },
    update: {
      name: "Teacher Demo",
      passwordHash: hashedPassword,
      roleId: teacherRole.id,
    },
    create: {
      name: "Teacher Demo",
      email: "teacher1@demo.com",
      passwordHash: hashedPassword,
      roleId: teacherRole.id,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student1@demo.com" },
    update: {
      name: "Student Demo",
      passwordHash: hashedPassword,
      roleId: studentRole.id,
    },
    create: {
      name: "Student Demo",
      email: "student1@demo.com",
      passwordHash: hashedPassword,
      roleId: studentRole.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin1@demo.com" },
    update: {
      name: "Admin Demo",
      passwordHash: hashedPassword,
      roleId: adminRole.id,
    },
    create: {
      name: "Admin Demo",
      email: "admin1@demo.com",
      passwordHash: hashedPassword,
      roleId: adminRole.id,
    },
  });

  await prisma.systemFlag.upsert({
    where: { key: "exam_mode_enabled" },
    update: { value: false },
    create: { key: "exam_mode_enabled", value: false },
  });

  await resetDemoData();

  const problem1 = await upsertProblemWithTests({
    title: "Sum of Two Numbers",
    description: SUM_DESCRIPTION,
    starterCode: EMPTY_STARTER,
    referenceSolution: SUM_REFERENCE,
    difficulty: "easy",
    language: "python",
    tags: ["math", "basics", "input-output"],
    category: "fundamentals",
    metadata: {
      difficultyBand: "easy",
      topic: "arithmetic",
      expectedConcepts: ["stdin", "parsing", "addition"],
    },
    createdById: teacher.id,
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: true },
      { input: "7 8", expectedOutput: "15", isHidden: false },
    ],
  });

  const problem2 = await upsertProblemWithTests({
    title: "Check Palindrome",
    description: PAL_DESCRIPTION,
    starterCode: EMPTY_STARTER,
    referenceSolution: PAL_REFERENCE,
    difficulty: "easy",
    language: "python",
    tags: ["string", "basics", "boolean"],
    category: "strings",
    metadata: {
      difficultyBand: "easy",
      topic: "palindrome",
      expectedConcepts: ["reverse", "comparison"],
    },
    createdById: teacher.id,
    testCases: [
      { input: "level", expectedOutput: "true", isHidden: false },
      { input: "hello", expectedOutput: "false", isHidden: true },
      { input: "abba", expectedOutput: "true", isHidden: false },
    ],
  });

  const problem3 = await upsertProblemWithTests({
    title: "Factorial",
    description: FACT_DESCRIPTION,
    starterCode: EMPTY_STARTER,
    referenceSolution: FACT_REFERENCE,
    difficulty: "medium",
    language: "python",
    tags: ["math", "recursion", "loops"],
    category: "algorithms",
    metadata: {
      difficultyBand: "medium",
      topic: "factorial",
      expectedConcepts: ["recursion", "iteration"],
    },
    createdById: teacher.id,
    testCases: [
      { input: "5", expectedOutput: "120", isHidden: false },
      { input: "1", expectedOutput: "1", isHidden: true },
      { input: "3", expectedOutput: "6", isHidden: false },
    ],
  });

  /** Demo: multiple tests, public + hidden, metadata; reference passes all cases in Judge0. */
  const DEMO_FULL_TEST_DESCRIPTION =
    "Same as Sum of Two Numbers: read one line with two space-separated integers and print their sum. " +
    "This demo problem ships four test cases (two public, two hidden). Submit passes only when all four match the expected output.";

  await upsertProblemWithTests({
    title: "Demo: Public and Hidden Tests",
    description: DEMO_FULL_TEST_DESCRIPTION,
    starterCode: EMPTY_STARTER,
    referenceSolution: SUM_REFERENCE,
    difficulty: "easy",
    language: "python",
    tags: ["demo", "test-cases", "grading"],
    category: "fundamentals",
    metadata: {
      demo: true,
      publicTestCount: 2,
      hiddenTestCount: 2,
      note: "Teacher defines stdin/expectedOutput per case; backend runs all on Submit.",
    },
    createdById: teacher.id,
    testCases: [
      { input: "3 4", expectedOutput: "7", isHidden: false },
      { input: "0 0", expectedOutput: "0", isHidden: false },
      { input: "-2 10", expectedOutput: "8", isHidden: true },
      { input: "99 1", expectedOutput: "100", isHidden: true },
    ],
  });

  // Submissions
  const sumAcceptedSubmission = await prisma.submission.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      code: SUM_REFERENCE.trim(),
      language: "python",
      status: "accepted",
      stdout: "Test 1: PASS\n---\nTest 2: PASS\n---\nTest 3: PASS",
      stderr: null,
      executionTime: 14,
      memory: 1024,
    },
  });

  const sumFailedSubmission = await prisma.submission.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      code: `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
const [a, b] = input.split(/\\s+/).map(Number);
console.log(a - b);`,
      language: "javascript",
      status: "failed",
      stdout: "Test 1: FAIL\nstdout:\n-1",
      stderr: null,
      executionTime: 12,
      memory: 1024,
    },
  });

  const palAcceptedSubmission = await prisma.submission.create({
    data: {
      userId: student.id,
      problemId: problem2.id,
      code: PAL_REFERENCE.trim(),
      language: "python",
      status: "accepted",
      stdout: "Test 1: PASS\n---\nTest 2: PASS\n---\nTest 3: PASS",
      stderr: null,
      executionTime: 15,
      memory: 1100,
    },
  });

  // SubmissionAttempts
  const rawAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: null,
      submissionId: null,
      mode: "raw",
      language: "python",
      sourceCode: "print('hello')",
      judge0Status: "Accepted",
      normalizedStatus: "accepted",
      publicPassed: null,
      publicTotal: null,
      hiddenPassed: null,
      hiddenTotal: null,
      allPassed: true,
      stdout: "hello\n",
      stderr: null,
      compileOutput: null,
      executionTimeMs: 8,
      memoryKb: 512,
    },
  });

  const sumWrongAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      submissionId: sumFailedSubmission.id,
      mode: "tests",
      language: "javascript",
      sourceCode: `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
const [a, b] = input.split(/\\s+/).map(Number);
console.log(a - b);`,
      judge0Status: "Wrong Answer",
      normalizedStatus: "wrong_answer",
      publicPassed: 0,
      publicTotal: 2,
      hiddenPassed: 0,
      hiddenTotal: 1,
      allPassed: false,
      stdout: "Test 1: FAIL\nstdout:\n-1",
      stderr: null,
      compileOutput: null,
      executionTimeMs: 12,
      memoryKb: 1024,
    },
  });

  const sumCompileAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      submissionId: null,
      mode: "tests",
      language: "javascript",
      sourceCode: `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
const [a, b] = input.split(/\\s+/).map(Number);
console.log(a + );`,
      judge0Status: "Compilation Error",
      normalizedStatus: "compile_error",
      publicPassed: 0,
      publicTotal: 2,
      hiddenPassed: 0,
      hiddenTotal: 1,
      allPassed: false,
      stdout: null,
      stderr: "SyntaxError: Unexpected token ')'",
      compileOutput: "SyntaxError: Unexpected token ')'",
      executionTimeMs: 0,
      memoryKb: 0,
    },
  });

  const sumAcceptedAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      submissionId: sumAcceptedSubmission.id,
      mode: "tests",
      language: "python",
      sourceCode: SUM_REFERENCE.trim(),
      judge0Status: "Accepted",
      normalizedStatus: "accepted",
      publicPassed: 2,
      publicTotal: 2,
      hiddenPassed: 1,
      hiddenTotal: 1,
      allPassed: true,
      stdout: "All tests passed",
      stderr: null,
      compileOutput: null,
      executionTimeMs: 14,
      memoryKb: 1024,
    },
  });

  const palAcceptedAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: problem2.id,
      submissionId: palAcceptedSubmission.id,
      mode: "tests",
      language: "python",
      sourceCode: PAL_REFERENCE.trim(),
      judge0Status: "Accepted",
      normalizedStatus: "accepted",
      publicPassed: 2,
      publicTotal: 2,
      hiddenPassed: 1,
      hiddenTotal: 1,
      allPassed: true,
      stdout: "All tests passed",
      stderr: null,
      compileOutput: null,
      executionTimeMs: 15,
      memoryKb: 1100,
    },
  });

  const factorialRuntimeAttempt = await prisma.submissionAttempt.create({
    data: {
      userId: student.id,
      problemId: problem3.id,
      submissionId: null,
      mode: "tests",
      language: "javascript",
      sourceCode: `throw new Error("boom");`,
      judge0Status: "Runtime Error",
      normalizedStatus: "runtime_error",
      publicPassed: 0,
      publicTotal: 2,
      hiddenPassed: 0,
      hiddenTotal: 1,
      allPassed: false,
      stdout: null,
      stderr: "Error: boom",
      compileOutput: null,
      executionTimeMs: 5,
      memoryKb: 900,
    },
  });

  console.log("Seed completed successfully.");
  console.log({
    teacherEmail: teacher.email,
    studentEmail: student.email,
    adminEmail: admin.email,
    problemIds: [problem1.id, problem2.id, problem3.id],
    demoFullTestsProblemTitle: "Demo: Public and Hidden Tests",
    sampleRawAttemptId: rawAttempt.id,
    sumAcceptedSubmissionId: sumAcceptedSubmission.id,
    adminId: admin.id,
  });
}

main()
  .catch(async (e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pgPool.end();
  });
