import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool as ConstructorParameters<typeof PrismaPg>[0]);
const prisma = new PrismaClient({ adapter });

const SUM_DESCRIPTION =
  "Read two integers from standard input (one line, space-separated) and print their sum as a single line.";

const SUM_STARTER = `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
const [a, b] = input.split(/\\s+/).map((x) => parseInt(x, 10));
// TODO: print a + b on one line
`;

const SUM_REFERENCE = `const fs = require('fs');
const input = fs.readFileSync(0, 'utf8').trim();
const [a, b] = input.split(/\\s+/).map((x) => parseInt(x, 10));
console.log(a + b);
`;

const PAL_DESCRIPTION =
  "Read one line from standard input and print true if it is a palindrome, otherwise false (lowercase booleans).";

const PAL_STARTER = `const fs = require('fs');
const s = fs.readFileSync(0, 'utf8').trim();
// TODO: print true or false on one line
`;

const PAL_REFERENCE = `const fs = require('fs');
const s = fs.readFileSync(0, 'utf8').trim();
const ok = s === s.split('').reverse().join('');
console.log(ok);
`;

const FACT_DESCRIPTION =
  "Read a positive integer n from standard input and print n factorial (n!) on one line.";

const FACT_STARTER = `const fs = require('fs');
const n = parseInt(fs.readFileSync(0, 'utf8').trim(), 10);
// TODO: print factorial of n on one line
`;

const FACT_REFERENCE = `const fs = require('fs');
const n = parseInt(fs.readFileSync(0, 'utf8').trim(), 10);
function fact(x) {
  if (x <= 1) return 1;
  return x * fact(x - 1);
}
console.log(fact(n));
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
    metadata: params.metadata ?? undefined,
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
      createdById: params.createdById,
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
    update: {
      value: false,
    },
    create: {
      key: "exam_mode_enabled",
      value: false,
    },
  });

  await resetDemoData();

    const problem1 = await upsertProblemWithTests({
    title: "Sum of Two Numbers",
    description: SUM_DESCRIPTION,
    starterCode: SUM_STARTER,
    referenceSolution: SUM_REFERENCE,
    difficulty: "easy",
    language: "javascript",
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
    starterCode: PAL_STARTER,
    referenceSolution: PAL_REFERENCE,
    difficulty: "easy",
    language: "javascript",
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
    starterCode: FACT_STARTER,
    referenceSolution: FACT_REFERENCE,
    difficulty: "medium",
    language: "javascript",
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

  // ----------------------------
  // Submissions
  // ----------------------------
  const sumAcceptedSubmission = await prisma.submission.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      code: SUM_REFERENCE.trim(),
      language: "javascript",
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
      language: "javascript",
      status: "accepted",
      stdout: "Test 1: PASS\n---\nTest 2: PASS\n---\nTest 3: PASS",
      stderr: null,
      executionTime: 15,
      memory: 1100,
    },
  });

  // ----------------------------
  // SubmissionAttempts
  // ----------------------------
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
      language: "javascript",
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
      language: "javascript",
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

  // ----------------------------
  // AiLogs
  // ----------------------------
  const aiLog1 = await prisma.aiLog.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      submissionId: sumFailedSubmission.id,
      mode: "practice",
      promptVersion: "mentor_v1",
      modelName: "ai-mentor",
      studentQuestion: "Nerede hata yapıyorum?",
      responseText: "Toplama yerine çıkarma yapıyor olabilirsin. İşlemi ve örnek girdiyi tekrar kontrol et.",
      requestPayload: {
        problemId: problem1.id,
        studentQuestion: "Nerede hata yapıyorum?",
      },
      responsePayload: {
        mentorReply:
          "Toplama yerine çıkarma yapıyor olabilirsin. İşlemi ve örnek girdiyi tekrar kontrol et.",
      },
    },
  });

  const aiLog2 = await prisma.aiLog.create({
    data: {
      userId: student.id,
      problemId: problem1.id,
      submissionId: sumAcceptedSubmission.id,
      mode: "practice",
      promptVersion: "mentor_v1",
      modelName: "ai-mentor",
      studentQuestion: "Kodum şimdi doğru mu?",
      responseText: "Evet, mevcut yaklaşımın doğru görünüyor. Şimdi edge case’leri de düşün.",
      requestPayload: {
        problemId: problem1.id,
        studentQuestion: "Kodum şimdi doğru mu?",
      },
      responsePayload: {
        mentorReply:
          "Evet, mevcut yaklaşımın doğru görünüyor. Şimdi edge case’leri de düşün.",
      },
    },
  });

  const aiLog3 = await prisma.aiLog.create({
    data: {
      userId: student.id,
      problemId: problem2.id,
      submissionId: palAcceptedSubmission.id,
      mode: "practice",
      promptVersion: "mentor_v1",
      modelName: "ai-mentor",
      studentQuestion: "Palindrome için daha kısa yol var mı?",
      responseText: "String’i ters çevirip karşılaştırmak kısa ve okunabilir bir yöntemdir.",
      requestPayload: {
        problemId: problem2.id,
        studentQuestion: "Palindrome için daha kısa yol var mı?",
      },
      responsePayload: {
        mentorReply:
          "String’i ters çevirip karşılaştırmak kısa ve okunabilir bir yöntemdir.",
      },
    },
  });

  // ----------------------------
  // HintEvents
  // ----------------------------
  await prisma.hintEvent.createMany({
    data: [
      {
        userId: student.id,
        problemId: problem1.id,
        attemptId: sumWrongAttempt.id,
        aiLogId: aiLog1.id,
        sequence: 1,
      },
      {
        userId: student.id,
        problemId: problem1.id,
        attemptId: sumAcceptedAttempt.id,
        aiLogId: aiLog2.id,
        sequence: 2,
      },
      {
        userId: student.id,
        problemId: problem2.id,
        attemptId: palAcceptedAttempt.id,
        aiLogId: aiLog3.id,
        sequence: 1,
      },
    ],
  });

  // ----------------------------
  // AIInteractionAudit
  // ----------------------------
  await prisma.aIInteractionAudit.createMany({
    data: [
      {
        userId: student.id,
        problemId: problem1.id,
        attemptId: sumWrongAttempt.id,
        mentorModel: "ai-mentor",
        validatorModel: null,
        mentorRaw:
          "Toplama yerine çıkarma yapıyor olabilirsin. İşlemi ve örnek girdiyi tekrar kontrol et.",
        validatorJson: {
          decision: "allow",
          reason: "safe mentor hint",
        },
        policyAction: "allow",
        finalText:
          "Toplama yerine çıkarma yapıyor olabilirsin. İşlemi ve örnek girdiyi tekrar kontrol et.",
        rewriteCount: 0,
        latencyMsMentor: 420,
        latencyMsValidator: null,
        errorCode: null,
      },
      {
        userId: student.id,
        problemId: problem1.id,
        attemptId: sumAcceptedAttempt.id,
        mentorModel: "ai-mentor",
        validatorModel: null,
        mentorRaw:
          "Evet, mevcut yaklaşımın doğru görünüyor. Şimdi edge case’leri de düşün.",
        validatorJson: {
          decision: "allow",
          reason: "safe mentor confirmation",
        },
        policyAction: "allow",
        finalText:
          "Evet, mevcut yaklaşımın doğru görünüyor. Şimdi edge case’leri de düşün.",
        rewriteCount: 0,
        latencyMsMentor: 390,
        latencyMsValidator: null,
        errorCode: null,
      },
      {
        userId: student.id,
        problemId: problem3.id,
        attemptId: factorialRuntimeAttempt.id,
        mentorModel: "ai-mentor",
        validatorModel: null,
        mentorRaw: "",
        validatorJson: null,
        policyAction: "block",
        finalText: "",
        rewriteCount: 0,
        latencyMsMentor: 250,
        latencyMsValidator: null,
        errorCode: "mentor_error",
      },
    ],
  });

  console.log("Seed completed successfully.");
  console.log({
    teacherEmail: teacher.email,
    studentEmail: student.email,
    adminEmail: admin.email,
    problemIds: [problem1.id, problem2.id, problem3.id],
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
    await pool.end();
  });