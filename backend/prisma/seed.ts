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

/** Judge0 runs the file as a Node program: read stdin, print stdout. */
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

type TestSpec = { input: string; expectedOutput: string; isHidden: boolean };

async function upsertProblemWithTests(params: {
  title: string;
  description: string;
  starterCode: string;
  referenceSolution: string;
  difficulty: string;
  language: string;
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
    update: {},
    create: {
      name: "Teacher Demo",
      email: "teacher1@demo.com",
      passwordHash: hashedPassword,
      roleId: teacherRole.id,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student1@demo.com" },
    update: {},
    create: {
      name: "Student Demo",
      email: "student1@demo.com",
      passwordHash: hashedPassword,
      roleId: studentRole.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin1@demo.com" },
    update: {},
    create: {
      name: "Admin Demo",
      email: "admin1@demo.com",
      passwordHash: hashedPassword,
      roleId: adminRole.id,
    },
  });

  const problem1 = await upsertProblemWithTests({
    title: "Sum of Two Numbers",
    description: SUM_DESCRIPTION,
    starterCode: SUM_STARTER,
    referenceSolution: SUM_REFERENCE,
    difficulty: "easy",
    language: "javascript",
    createdById: teacher.id,
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: true },
    ],
  });

  const problem2 = await upsertProblemWithTests({
    title: "Check Palindrome",
    description: PAL_DESCRIPTION,
    starterCode: PAL_STARTER,
    referenceSolution: PAL_REFERENCE,
    difficulty: "easy",
    language: "javascript",
    createdById: teacher.id,
    testCases: [
      { input: "level", expectedOutput: "true", isHidden: false },
      { input: "hello", expectedOutput: "false", isHidden: true },
    ],
  });

  const problem3 = await upsertProblemWithTests({
    title: "Factorial",
    description: FACT_DESCRIPTION,
    starterCode: FACT_STARTER,
    referenceSolution: FACT_REFERENCE,
    difficulty: "medium",
    language: "javascript",
    createdById: teacher.id,
    testCases: [
      { input: "5", expectedOutput: "120", isHidden: false },
      { input: "1", expectedOutput: "1", isHidden: true },
    ],
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

  const existingSubmission = await prisma.submission.findFirst({
    where: {
      userId: student.id,
      problemId: problem1.id,
      status: "accepted",
    },
  });

  if (!existingSubmission) {
    await prisma.submission.create({
      data: {
        userId: student.id,
        problemId: problem1.id,
        code: SUM_REFERENCE.trim(),
        language: "javascript",
        status: "accepted",
        stdout: "5",
        executionTime: 12.5,
        memory: 1024,
      },
    });
  }

  const existingAiLog = await prisma.aiLog.findFirst({
    where: {
      userId: student.id,
      problemId: problem2.id,
      promptVersion: "mentor_v1",
    },
  });

  if (!existingAiLog) {
    await prisma.aiLog.create({
      data: {
        userId: student.id,
        problemId: problem2.id,
        mode: "practice",
        promptVersion: "mentor_v1",
        modelName: "gpt-4o-mini",
        studentQuestion: "Why is my palindrome code failing?",
        responseText: "Check whether you are comparing the reversed string correctly.",
        requestPayload: {
          code: "const fs = require('fs'); console.log(false);",
          question: "Why is my palindrome code failing?",
        },
        responsePayload: {
          observation: "The current code always prints false.",
        },
      },
    });
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
