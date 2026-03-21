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

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

  let problem1 = await prisma.problem.findFirst({
    where: { title: "Sum of Two Numbers" },
  });

  if (!problem1) {
    problem1 = await prisma.problem.create({
      data: {
        title: "Sum of Two Numbers",
        description: "Write a function that takes two integers and returns their sum.",
        starterCode: "function solve(a, b) {\n  // write your code here\n}\n",
        referenceSolution: "function solve(a, b) {\n  return a + b;\n}\n",
        difficulty: "easy",
        language: "javascript",
        createdById: teacher.id,
        testCases: {
          create: [
            { input: "2 3", expectedOutput: "5", isHidden: false },
            { input: "10 20", expectedOutput: "30", isHidden: true },
          ],
        },
      },
    });
  }

  let problem2 = await prisma.problem.findFirst({
    where: { title: "Check Palindrome" },
  });

  if (!problem2) {
    problem2 = await prisma.problem.create({
      data: {
        title: "Check Palindrome",
        description: "Given a string, return true if it is a palindrome, otherwise false.",
        starterCode: "function solve(str) {\n  // write your code here\n}\n",
        referenceSolution:
          "function solve(str) {\n  const reversed = str.split('').reverse().join('');\n  return str === reversed;\n}\n",
        difficulty: "easy",
        language: "javascript",
        createdById: teacher.id,
        testCases: {
          create: [
            { input: "level", expectedOutput: "true", isHidden: false },
            { input: "hello", expectedOutput: "false", isHidden: true },
          ],
        },
      },
    });
  }

  let problem3 = await prisma.problem.findFirst({
    where: { title: "Factorial" },
  });

  if (!problem3) {
    problem3 = await prisma.problem.create({
      data: {
        title: "Factorial",
        description: "Given a positive integer n, return n factorial.",
        starterCode: "function solve(n) {\n  // write your code here\n}\n",
        referenceSolution:
          "function solve(n) {\n  let result = 1;\n  for (let i = 2; i <= n; i++) result *= i;\n  return result;\n}\n",
        difficulty: "medium",
        language: "javascript",
        createdById: teacher.id,
        testCases: {
          create: [
            { input: "5", expectedOutput: "120", isHidden: false },
            { input: "1", expectedOutput: "1", isHidden: true },
          ],
        },
      },
    });
  }

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
        code: "function solve(a, b) { return a + b; }",
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
          code: "function solve(str) { return false; }",
          question: "Why is my palindrome code failing?",
        },
        responsePayload: {
          observation: "The current code always returns false.",
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