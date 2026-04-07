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

/** Judge0 seed examples for Python (MVP supports C/Python). */
const SUM_DESCRIPTION =
  "Read two integers from standard input (one line, space-separated) and print their sum as a single line.";

const SUM_STARTER = `line = input().strip()
a, b = map(int, line.split())
# TODO: print a + b on one line
`;

const SUM_REFERENCE = `line = input().strip()
a, b = map(int, line.split())
print(a + b)
`;

const PAL_DESCRIPTION =
  "Read one line from standard input and print true if it is a palindrome, otherwise false (lowercase booleans).";

const PAL_STARTER = `s = input().strip()
# TODO: print true or false on one line
`;

const PAL_REFERENCE = `s = input().strip()
ok = s == s[::-1]
print(str(ok).lower())
`;

const FACT_DESCRIPTION =
  "Read a positive integer n from standard input and print n factorial (n!) on one line.";

const FACT_STARTER = `n = int(input().strip())
# TODO: print factorial of n on one line
`;

const FACT_REFERENCE = `n = int(input().strip())
def fact(x: int) -> int:
    if x <= 1:
        return 1
    return x * fact(x - 1)

print(fact(n))
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
    language: "python",
    createdById: teacher.id,
    testCases: [
      { input: "2 3", expectedOutput: "5", isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: true },
    ],
  });
  await prisma.problem.update({
    where: { id: problem1.id },
    data: {
      tags: ["math", "basics", "io"],
      category: "fundamentals",
      metadata: {
        topic: "arithmetic",
        inputFormat: "two integers",
        difficultyBand: "intro",
      },
    },
  });

  const problem2 = await upsertProblemWithTests({
    title: "Check Palindrome",
    description: PAL_DESCRIPTION,
    starterCode: PAL_STARTER,
    referenceSolution: PAL_REFERENCE,
    difficulty: "easy",
    language: "python",
    createdById: teacher.id,
    testCases: [
      { input: "level", expectedOutput: "true", isHidden: false },
      { input: "hello", expectedOutput: "false", isHidden: true },
    ],
  });
  await prisma.problem.update({
    where: { id: problem2.id },
    data: {
      tags: ["strings", "two-pointers"],
      category: "strings",
      metadata: {
        topic: "palindrome",
        technique: "two-pointers",
        difficultyBand: "intro",
      },
    },
  });

  const problem3 = await upsertProblemWithTests({
    title: "Factorial",
    description: FACT_DESCRIPTION,
    starterCode: FACT_STARTER,
    referenceSolution: FACT_REFERENCE,
    difficulty: "medium",
    language: "python",
    createdById: teacher.id,
    testCases: [
      { input: "5", expectedOutput: "120", isHidden: false },
      { input: "1", expectedOutput: "1", isHidden: true },
    ],
  });
  await prisma.problem.update({
    where: { id: problem3.id },
    data: {
      tags: ["math", "recursion"],
      category: "math",
      metadata: {
        topic: "factorial",
        technique: "recursion",
        difficultyBand: "core",
      },
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
        language: "python",
        status: "accepted",
        stdout: "5",
        executionTime: 12.5,
        memory: 1024,
      },
    });
  }

  const latestSubmission = await prisma.submission.findFirst({
    where: {
      userId: student.id,
      problemId: problem1.id,
    },
    orderBy: { createdAt: "desc" },
  });

  if (latestSubmission) {
    const existingAttempt = await prisma.submissionAttempt.findFirst({
      where: {
        submissionId: latestSubmission.id,
      },
    });

    if (!existingAttempt) {
      await prisma.submissionAttempt.create({
        data: {
          userId: student.id,
          problemId: problem1.id,
          submissionId: latestSubmission.id,
          language: "python",
          mode: "tests",
          judge0StatusId: 3,
          judge0Status: "Accepted",
          statusCategory: "accepted",
          passedPublicCount: 1,
          totalPublicCount: 1,
          passedHiddenCount: 1,
          totalHiddenCount: 1,
          stdout: "5",
          executionTime: 12.5,
          memory: 1024,
        },
      });
    }
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
          code: "s = input().strip()\nprint(str(s == s[::-1]).lower())",
          question: "Why is my palindrome code failing?",
        },
        responsePayload: {
          observation: "The current code always prints false.",
        },
      },
    });
  }

  const latestAiLog = await prisma.aiLog.findFirst({
    where: {
      userId: student.id,
      problemId: problem2.id,
      promptVersion: "mentor_v1",
    },
    orderBy: { createdAt: "desc" },
  });

  if (latestAiLog) {
    const existingHint = await prisma.hintEvent.findFirst({
      where: {
        aiLogId: latestAiLog.id,
      },
    });

    if (!existingHint) {
      await prisma.hintEvent.create({
        data: {
          userId: student.id,
          problemId: problem2.id,
          aiLogId: latestAiLog.id,
          sequence: 1,
          mode: "hint",
        },
      });
    }

    const existingAudit = await prisma.aiInteractionAudit.findFirst({
      where: {
        aiLogId: latestAiLog.id,
      },
    });

    if (!existingAudit) {
      await prisma.aiInteractionAudit.create({
        data: {
          userId: student.id,
          problemId: problem2.id,
          aiLogId: latestAiLog.id,
          mentorRaw: latestAiLog.responseText,
          validatorJson: {
            riskScore: 0.05,
            decision: "allow",
            violations: [],
          },
          policyAction: "allow",
          finalText: latestAiLog.responseText,
          mentorModel: latestAiLog.modelName,
          validatorModel: "validator-heuristic",
          durationMs: 1000,
        },
      });
    }
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
