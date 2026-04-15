import "dotenv/config";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

// Inline client so the seed works in both dev (src/) and production (dist/) containers
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pgPool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
const prisma  = new PrismaClient({ adapter }) as unknown as PrismaClient;

// ─────────────────────────────────────────────────────────────────────────────
// Reference solutions & starter code
// ─────────────────────────────────────────────────────────────────────────────

// ── Python ────────────────────────────────────────────────────────────────────
const SUM_DESC = "Read two integers from standard input (one line, space-separated) and print their sum as a single line.";
const SUM_REF  = `line = input().strip()\na, b = map(int, line.split())\nprint(a + b)\n`;

const PAL_DESC = "Read one line from standard input and print true if it is a palindrome, otherwise false (lowercase booleans).";
const PAL_REF  = `s = input().strip()\nok = s == s[::-1]\nprint(str(ok).lower())\n`;

const FACT_DESC = "Read a positive integer n from standard input and print n factorial (n!) on one line.";
const FACT_REF  = `n = int(input().strip())\ndef fact(x):\n    return 1 if x <= 1 else x * fact(x - 1)\nprint(fact(n))\n`;

const FIB_DESC    = "Read a positive integer N and print the first N Fibonacci numbers separated by spaces. F(1)=1, F(2)=1, F(3)=2, and so on.";
const FIB_STARTER = `n = int(input().strip())\n# Print the first n Fibonacci numbers, space-separated\n`;
const FIB_REF     = `n = int(input().strip())\na, b = 1, 1\nresult = []\nfor _ in range(n):\n    result.append(a)\n    a, b = b, a + b\nprint(*result)\n`;

const LCS_DESC = `Given two strings on separate lines, find the length of their Longest Common Subsequence (LCS).

A subsequence is derived by deleting some characters without changing the order of the remaining ones.
The LCS is the longest such subsequence common to both strings.

Example: LCS("ABCBDAB", "BDCABA") = 4`;
const LCS_STARTER = `s1 = input().strip()\ns2 = input().strip()\n# Find the length of the LCS using dynamic programming\n`;
const LCS_REF     = `s1 = input().strip()\ns2 = input().strip()\nm, n = len(s1), len(s2)\ndp = [[0]*(n+1) for _ in range(m+1)]\nfor i in range(1, m+1):\n    for j in range(1, n+1):\n        if s1[i-1] == s2[j-1]:\n            dp[i][j] = dp[i-1][j-1] + 1\n        else:\n            dp[i][j] = max(dp[i-1][j], dp[i][j-1])\nprint(dp[m][n])\n`;

// ── C ─────────────────────────────────────────────────────────────────────────
const C_MAX_DESC    = "Read an integer N, then N space-separated integers on the next line. Print the maximum value among them.";
const C_MAX_STARTER = `#include <stdio.h>\n\nint main() {\n    int n;\n    scanf("%d", &n);\n    // Read n integers and find the maximum\n    \n    return 0;\n}\n`;
const C_MAX_REF     = `#include <stdio.h>\nint main() {\n    int n; scanf("%d", &n);\n    int max, x; scanf("%d", &max);\n    for (int i = 1; i < n; i++) {\n        scanf("%d", &x);\n        if (x > max) max = x;\n    }\n    printf("%d\\n", max);\n    return 0;\n}\n`;

const C_WORDS_DESC    = "Read a single line of text and print the number of words in it. Words are separated by one or more spaces.";
const C_WORDS_STARTER = `#include <stdio.h>\n#include <ctype.h>\n\nint main() {\n    char line[1000];\n    fgets(line, sizeof(line), stdin);\n    // Count the number of words\n    \n    return 0;\n}\n`;
const C_WORDS_REF     = `#include <stdio.h>\n#include <ctype.h>\nint main() {\n    char line[1000];\n    fgets(line, sizeof(line), stdin);\n    int count = 0, inWord = 0;\n    for (int i = 0; line[i]; i++) {\n        if (!isspace((unsigned char)line[i])) {\n            if (!inWord) { count++; inWord = 1; }\n        } else { inWord = 0; }\n    }\n    printf("%d\\n", count);\n    return 0;\n}\n`;

// ── C++ ───────────────────────────────────────────────────────────────────────
const CPP_SORT_DESC    = "Read three integers and print them in ascending (non-decreasing) order, separated by spaces.";
const CPP_SORT_STARTER = `#include <iostream>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    // Sort and print in ascending order\n    \n    return 0;\n}\n`;
const CPP_SORT_REF     = `#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    int arr[3] = {a, b, c};\n    sort(arr, arr + 3);\n    cout << arr[0] << " " << arr[1] << " " << arr[2] << endl;\n    return 0;\n}\n`;

const CPP_BS_DESC    = `Given a sorted array of N integers and a target T, return the 0-based index of T using binary search. Print -1 if not found.\n\nInput:\n- Line 1: N\n- Line 2: N space-separated sorted integers\n- Line 3: T`;
const CPP_BS_STARTER = `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint binarySearch(vector<int>& arr, int target) {\n    // Implement binary search here\n    return -1;\n}\n\nint main() {\n    int n;\n    cin >> n;\n    vector<int> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    int target;\n    cin >> target;\n    cout << binarySearch(arr, target) << endl;\n    return 0;\n}\n`;
const CPP_BS_REF     = `#include <iostream>\n#include <vector>\nusing namespace std;\nint binarySearch(vector<int>& arr, int target) {\n    int lo = 0, hi = (int)arr.size() - 1;\n    while (lo <= hi) {\n        int mid = lo + (hi - lo) / 2;\n        if (arr[mid] == target) return mid;\n        else if (arr[mid] < target) lo = mid + 1;\n        else hi = mid - 1;\n    }\n    return -1;\n}\nint main() {\n    int n; cin >> n;\n    vector<int> arr(n);\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    int target; cin >> target;\n    cout << binarySearch(arr, target) << endl;\n    return 0;\n}\n`;

// ── JavaScript ────────────────────────────────────────────────────────────────
const JS_FIZZ_DESC    = `Read a positive integer N. For each number from 1 to N:\n- If divisible by both 3 and 5, print "FizzBuzz"\n- If divisible by 3, print "Fizz"\n- If divisible by 5, print "Buzz"\n- Otherwise print the number\n\nOne result per line.`;
const JS_FIZZ_STARTER = `const n = parseInt(require('fs').readFileSync('/dev/stdin', 'utf8').trim());\nfor (let i = 1; i <= n; i++) {\n    // Write your FizzBuzz logic here\n}\n`;
const JS_FIZZ_REF     = `const n = parseInt(require('fs').readFileSync('/dev/stdin', 'utf8').trim());\nfor (let i = 1; i <= n; i++) {\n    if (i % 15 === 0) console.log('FizzBuzz');\n    else if (i % 3 === 0) console.log('Fizz');\n    else if (i % 5 === 0) console.log('Buzz');\n    else console.log(i);\n}\n`;

const JS_SUM_DESC    = "Read N integers (first line is N, then N lines each with one integer) and print their sum.";
const JS_SUM_STARTER = `const lines = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split('\\n');\nconst n = parseInt(lines[0]);\nlet sum = 0;\n// Sum the next n numbers and print the result\n`;
const JS_SUM_REF     = `const lines = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split('\\n');\nconst n = parseInt(lines[0]);\nlet sum = 0;\nfor (let i = 1; i <= n; i++) sum += parseInt(lines[i]);\nconsole.log(sum);\n`;

// ── C# ────────────────────────────────────────────────────────────────────────
const CS_TEMP_DESC    = "Read a temperature in Celsius and print its Fahrenheit equivalent with exactly 2 decimal places.\n\nFormula: F = C × 9/5 + 32";
const CS_TEMP_STARTER = `using System;\n\nclass Program {\n    static void Main(string[] args) {\n        double celsius = double.Parse(Console.ReadLine().Trim());\n        // Convert to Fahrenheit and print with 2 decimal places\n        \n    }\n}\n`;
const CS_TEMP_REF     = `using System;\nclass Program {\n    static void Main(string[] args) {\n        double celsius = double.Parse(Console.ReadLine().Trim());\n        double fahrenheit = celsius * 9.0 / 5.0 + 32.0;\n        Console.WriteLine($"{fahrenheit:F2}");\n    }\n}\n`;

// ── Multi-file demo ───────────────────────────────────────────────────────────
const MULTIFILE_DESC = `This problem is designed to demonstrate the **multi-file editor** feature.

You must split your solution across two editor tabs:

**Tab 1 — helpers.py**
Define three helper functions:
- \`add(a, b)\`      → returns the sum of a and b
- \`subtract(a, b)\` → returns the difference (a − b)
- \`multiply(a, b)\` → returns the product of a and b

**Tab 2 — main.py** (starter code is already here)
Read two integers from input and call your helper functions to print:
1. Their sum
2. Their difference
3. Their product

How to add a second tab: click the **+** button next to the file tabs above the editor, rename the new file to \`helpers.py\`, and write your helper functions there.

When you click **Run** or **Submit**, all open tabs are combined and executed together — so functions defined in helpers.py are directly available in main.py.`;

const MULTIFILE_STARTER = `# main.py  ← this is Tab 1
# Create a second tab called helpers.py and define add(), subtract(), multiply() there.
# Because all tabs are merged on Run/Submit, you can call those functions directly here.

a, b = map(int, input().split())
print(add(a, b))
print(subtract(a, b))
print(multiply(a, b))
`;

// Combined solution (what Judge0 actually executes — both files merged)
const MULTIFILE_REF = `# helpers.py
def add(a, b):      return a + b
def subtract(a, b): return a - b
def multiply(a, b): return a * b

# main.py
a, b = map(int, input().split())
print(add(a, b))
print(subtract(a, b))
print(multiply(a, b))
`;

const DEMO_DESC = "Same as Sum of Two Numbers: read one line with two space-separated integers and print their sum. " +
  "This demo problem ships four test cases (two public, two hidden). Submit passes only when all four match.";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type TestSpec = { input: string; expectedOutput: string; isHidden: boolean };

async function upsertProblemWithTests(params: {
  title: string; description: string; starterCode: string;
  referenceSolution: string; difficulty: string; language: string;
  tags: string[]; category?: string; createdById: number; testCases: TestSpec[];
}) {
  const existing = await prisma.problem.findFirst({ where: { title: params.title } });
  const common = {
    description: params.description, starterCode: params.starterCode,
    referenceSolution: params.referenceSolution, difficulty: params.difficulty,
    language: params.language, tags: params.tags, category: params.category ?? null,
    metadata: undefined as Prisma.InputJsonValue | undefined,
  };
  if (existing) {
    await prisma.testCase.deleteMany({ where: { problemId: existing.id } });
    return prisma.problem.update({
      where: { id: existing.id },
      data: { ...common, testCases: { create: params.testCases } },
    });
  }
  return prisma.problem.create({
    data: {
      title: params.title, ...common,
      createdBy: { connect: { id: params.createdById } },
      testCases: { create: params.testCases },
    },
  });
}

async function resetDemoData() {
  // Delete in FK-dependency order (dependents first, parents last).
  // Verified against schema.prisma — no guessing, no try-catch needed.
  await prisma.hintEvent.deleteMany();          // → SubmissionAttempt, AiLog, Problem
  await prisma.aIInteractionAudit.deleteMany(); // → SubmissionAttempt, Problem
  await prisma.aiLog.deleteMany();              // → Submission, Problem
  await prisma.submissionAttempt.deleteMany();  // → Submission, Problem
  await prisma.submission.deleteMany();         // → Problem
  await prisma.grade.deleteMany();              // → Assignment, Rubric
  await prisma.assignmentEnrollment.deleteMany();// → Assignment
  await prisma.assignment.deleteMany();         // → Problem
  await prisma.problemVariation.deleteMany();   // → Problem
  await prisma.problem.deleteMany();            // cascades: TestCase, Rubric (onDelete: Cascade)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // ── Roles ──────────────────────────────────────────────────────────────────
  const studentRole = await prisma.role.upsert({ where: { name: "student" }, update: {}, create: { name: "student" } });
  const teacherRole = await prisma.role.upsert({ where: { name: "teacher" }, update: {}, create: { name: "teacher" } });
  const adminRole   = await prisma.role.upsert({ where: { name: "admin"   }, update: {}, create: { name: "admin"   } });

  const pw = await bcrypt.hash("123456", 10);

  // ── Users ──────────────────────────────────────────────────────────────────
  const teacher = await prisma.user.upsert({
    where: { email: "teacher1@demo.com" },
    update: { name: "Teacher Demo", passwordHash: pw, roleId: teacherRole.id },
    create: { name: "Teacher Demo", email: "teacher1@demo.com", passwordHash: pw, roleId: teacherRole.id },
  });

  await prisma.user.upsert({
    where: { email: "admin1@demo.com" },
    update: { name: "Admin Demo", passwordHash: pw, roleId: adminRole.id },
    create: { name: "Admin Demo", email: "admin1@demo.com", passwordHash: pw, roleId: adminRole.id },
  });

  const studentDefs = [
    { email: "student1@demo.com",  name: "Ahmet Yılmaz"   },
    { email: "student2@demo.com",  name: "Ayşe Kaya"      },
    { email: "student3@demo.com",  name: "Mehmet Demir"   },
    { email: "student4@demo.com",  name: "Fatma Çelik"    },
    { email: "student5@demo.com",  name: "Ali Şahin"      },
    { email: "student6@demo.com",  name: "Zeynep Yıldız"  },
    { email: "student7@demo.com",  name: "Mustafa Öztürk" },
    { email: "student8@demo.com",  name: "Emine Arslan"   },
    { email: "student9@demo.com",  name: "Hasan Doğan"    },
    { email: "student10@demo.com", name: "Merve Aydın"    },
  ];

  const students = await Promise.all(
    studentDefs.map((s) =>
      prisma.user.upsert({
        where:  { email: s.email },
        update: { name: s.name, passwordHash: pw, roleId: studentRole.id },
        create: { name: s.name, email: s.email, passwordHash: pw, roleId: studentRole.id },
      }),
    ),
  );

  await prisma.systemFlag.upsert({
    where:  { key: "exam_mode_enabled" },
    update: { value: false },
    create: { key: "exam_mode_enabled", value: false },
  });

  await resetDemoData();

  // ── Problems ───────────────────────────────────────────────────────────────

  // Python – Easy
  const pSum = await upsertProblemWithTests({
    title: "Sum of Two Numbers", description: SUM_DESC, starterCode: "",
    referenceSolution: SUM_REF, difficulty: "Easy", language: "python",
    tags: ["math", "basics", "input-output"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "2 3",   expectedOutput: "5",  isHidden: false },
      { input: "10 20", expectedOutput: "30", isHidden: true  },
      { input: "7 8",   expectedOutput: "15", isHidden: false },
    ],
  });

  // Python – Easy
  const pPal = await upsertProblemWithTests({
    title: "Check Palindrome", description: PAL_DESC, starterCode: "",
    referenceSolution: PAL_REF, difficulty: "Easy", language: "python",
    tags: ["string", "basics"], category: "Strings",
    createdById: teacher.id,
    testCases: [
      { input: "level", expectedOutput: "true",  isHidden: false },
      { input: "hello", expectedOutput: "false", isHidden: true  },
      { input: "abba",  expectedOutput: "true",  isHidden: false },
    ],
  });

  // Python – Medium
  const pFact = await upsertProblemWithTests({
    title: "Factorial", description: FACT_DESC, starterCode: "",
    referenceSolution: FACT_REF, difficulty: "Medium", language: "python",
    tags: ["math", "recursion"], category: "Algorithms",
    createdById: teacher.id,
    testCases: [
      { input: "5", expectedOutput: "120", isHidden: false },
      { input: "1", expectedOutput: "1",   isHidden: true  },
      { input: "3", expectedOutput: "6",   isHidden: false },
    ],
  });

  // Python – Medium
  const pFib = await upsertProblemWithTests({
    title: "Fibonacci Sequence", description: FIB_DESC,
    starterCode: FIB_STARTER, referenceSolution: FIB_REF,
    difficulty: "Medium", language: "python",
    tags: ["math", "sequences"], category: "Algorithms",
    createdById: teacher.id,
    testCases: [
      { input: "5", expectedOutput: "1 1 2 3 5",          isHidden: false },
      { input: "1", expectedOutput: "1",                  isHidden: false },
      { input: "8", expectedOutput: "1 1 2 3 5 8 13 21", isHidden: true  },
    ],
  });

  // Python – Hard
  const pLCS = await upsertProblemWithTests({
    title: "Longest Common Subsequence", description: LCS_DESC,
    starterCode: LCS_STARTER, referenceSolution: LCS_REF,
    difficulty: "Hard", language: "python",
    tags: ["dp", "strings", "algorithms"], category: "Dynamic Programming",
    createdById: teacher.id,
    testCases: [
      { input: "ABCBDAB\nBDCABA",  expectedOutput: "4", isHidden: false },
      { input: "AGGTAB\nGXTXAYB", expectedOutput: "4", isHidden: true  },
      { input: "abc\nabc",         expectedOutput: "3", isHidden: false },
      { input: "abc\ndef",         expectedOutput: "0", isHidden: true  },
    ],
  });

  // C – Easy
  const pMaxC = await upsertProblemWithTests({
    title: "Find Maximum in Array", description: C_MAX_DESC,
    starterCode: C_MAX_STARTER, referenceSolution: C_MAX_REF,
    difficulty: "Easy", language: "c",
    tags: ["arrays", "loops"], category: "Arrays",
    createdById: teacher.id,
    testCases: [
      { input: "5\n3 1 4 1 5",    expectedOutput: "5",  isHidden: false },
      { input: "3\n10 20 15",     expectedOutput: "20", isHidden: false },
      { input: "4\n-5 -3 -8 -1", expectedOutput: "-1", isHidden: true  },
    ],
  });

  // C – Medium
  const pWordsC = await upsertProblemWithTests({
    title: "Count Words in String", description: C_WORDS_DESC,
    starterCode: C_WORDS_STARTER, referenceSolution: C_WORDS_REF,
    difficulty: "Medium", language: "c",
    tags: ["strings", "parsing"], category: "Strings",
    createdById: teacher.id,
    testCases: [
      { input: "hello world",         expectedOutput: "2", isHidden: false },
      { input: "the quick brown fox", expectedOutput: "4", isHidden: true  },
      { input: "one",                 expectedOutput: "1", isHidden: false },
    ],
  });

  // C++ – Easy
  const pSortCpp = await upsertProblemWithTests({
    title: "Sort Three Numbers", description: CPP_SORT_DESC,
    starterCode: CPP_SORT_STARTER, referenceSolution: CPP_SORT_REF,
    difficulty: "Easy", language: "cpp",
    tags: ["sorting", "basics"], category: "Sorting",
    createdById: teacher.id,
    testCases: [
      { input: "3 1 2",  expectedOutput: "1 2 3",  isHidden: false },
      { input: "5 5 5",  expectedOutput: "5 5 5",  isHidden: false },
      { input: "-1 0 1", expectedOutput: "-1 0 1", isHidden: true  },
    ],
  });

  // C++ – Medium
  const pBsCpp = await upsertProblemWithTests({
    title: "Binary Search", description: CPP_BS_DESC,
    starterCode: CPP_BS_STARTER, referenceSolution: CPP_BS_REF,
    difficulty: "Medium", language: "cpp",
    tags: ["search", "binary-search", "arrays"], category: "Algorithms",
    createdById: teacher.id,
    testCases: [
      { input: "5\n1 3 5 7 9\n7", expectedOutput: "3",  isHidden: false },
      { input: "5\n1 3 5 7 9\n6", expectedOutput: "-1", isHidden: false },
      { input: "1\n42\n42",       expectedOutput: "0",  isHidden: true  },
    ],
  });

  // JavaScript – Easy
  const pFizzJs = await upsertProblemWithTests({
    title: "FizzBuzz", description: JS_FIZZ_DESC,
    starterCode: JS_FIZZ_STARTER, referenceSolution: JS_FIZZ_REF,
    difficulty: "Easy", language: "javascript",
    tags: ["loops", "conditionals", "basics"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "5",  expectedOutput: "1\n2\nFizz\n4\nBuzz",                                                       isHidden: false },
      { input: "3",  expectedOutput: "1\n2\nFizz",                                                                isHidden: false },
      { input: "15", expectedOutput: "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz", isHidden: true  },
    ],
  });

  // JavaScript – Medium
  const pArrJs = await upsertProblemWithTests({
    title: "Array Sum", description: JS_SUM_DESC,
    starterCode: JS_SUM_STARTER, referenceSolution: JS_SUM_REF,
    difficulty: "Medium", language: "javascript",
    tags: ["arrays", "loops", "math"], category: "Arrays",
    createdById: teacher.id,
    testCases: [
      { input: "3\n1\n2\n3",            expectedOutput: "6",   isHidden: false },
      { input: "1\n42",                 expectedOutput: "42",  isHidden: false },
      { input: "5\n10\n20\n30\n40\n50", expectedOutput: "150", isHidden: true  },
    ],
  });

  // C# – Easy
  const pTempCs = await upsertProblemWithTests({
    title: "Temperature Converter", description: CS_TEMP_DESC,
    starterCode: CS_TEMP_STARTER, referenceSolution: CS_TEMP_REF,
    difficulty: "Easy", language: "csharp",
    tags: ["math", "basics", "formatting"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "0",   expectedOutput: "32.00",  isHidden: false },
      { input: "100", expectedOutput: "212.00", isHidden: true  },
      { input: "37",  expectedOutput: "98.60",  isHidden: false },
    ],
  });

  // Multi-file demo — shows the tab editor feature
  const pMultiFile = await upsertProblemWithTests({
    title: "Multi-File: Math Helper Library", description: MULTIFILE_DESC,
    starterCode: MULTIFILE_STARTER, referenceSolution: MULTIFILE_REF,
    difficulty: "Easy", language: "python",
    tags: ["multi-file", "functions", "demo"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "3 4",   expectedOutput: "7\n-1\n12",    isHidden: false },
      { input: "10 5",  expectedOutput: "15\n5\n50",    isHidden: false },
      { input: "7 3",   expectedOutput: "10\n4\n21",    isHidden: true  },
      { input: "-2 6",  expectedOutput: "4\n-8\n-12",   isHidden: true  },
    ],
  });

  // Demo problem (published = false — shows teacher draft state)
  await upsertProblemWithTests({
    title: "Demo: Public and Hidden Tests", description: DEMO_DESC,
    starterCode: "", referenceSolution: SUM_REF,
    difficulty: "Easy", language: "python",
    tags: ["demo"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "3 4",   expectedOutput: "7",   isHidden: false },
      { input: "0 0",   expectedOutput: "0",   isHidden: false },
      { input: "-2 10", expectedOutput: "8",   isHidden: true  },
      { input: "99 1",  expectedOutput: "100", isHidden: true  },
    ],
  });

  // ── Assignments ────────────────────────────────────────────────────────────

  const now          = new Date();
  const inOneWeek    = new Date(now.getTime() + 7  * 86_400_000);
  const inTwoWeeks   = new Date(now.getTime() + 14 * 86_400_000);
  const inOneMonth   = new Date(now.getTime() + 30 * 86_400_000);
  const threeDaysAgo = new Date(now.getTime() - 3  * 86_400_000);

  async function mkAssignment(opts: {
    title: string; description?: string;
    problemId: number; dueDate: Date | null;
    isPublished: boolean; idx: number[]; // indices into students[]
  }) {
    const a = await prisma.assignment.create({
      data: {
        title:       opts.title,
        description: opts.description ?? null,
        problemId:   opts.problemId,
        createdById: teacher.id,
        dueDate:     opts.dueDate,
        isPublished: opts.isPublished,
      },
    });
    if (opts.idx.length > 0) {
      await prisma.assignmentEnrollment.createMany({
        data: opts.idx.map((i) => ({ assignmentId: a.id, userId: students[i].id })),
        skipDuplicates: true,
      });
    }
    return a;
  }

  // Python labs — all 10 students enrolled
  await mkAssignment({ title: "Lab 1: Sum of Two Numbers",    problemId: pSum.id,     dueDate: inOneWeek,    isPublished: true,  idx: [0,1,2,3,4,5,6,7,8,9] });
  await mkAssignment({ title: "Lab 2: Check Palindrome",      problemId: pPal.id,     dueDate: inOneWeek,    isPublished: true,  idx: [0,1,2,3,4,5,6,7,8,9] });
  await mkAssignment({ title: "Lab 3: Factorial",             problemId: pFact.id,    dueDate: inTwoWeeks,   isPublished: true,  idx: [0,1,2,3,4,5,6,7,8,9] });
  await mkAssignment({ title: "Lab 4: Fibonacci Sequence",    problemId: pFib.id,     dueDate: inTwoWeeks,   isPublished: true,  idx: [0,1,2,3,4,5,6,7,8,9] });
  await mkAssignment({ title: "Challenge: LCS (overdue)",     problemId: pLCS.id,     dueDate: threeDaysAgo, isPublished: true,  idx: [0,1,2,3,4,5,6,7,8,9],
    description: "This assignment was due 3 days ago. Demonstrates the overdue (red) due-date indicator." });

  // C labs — students 1–5 (idx 0–4)
  await mkAssignment({ title: "C Lab 1: Find Maximum in Array", problemId: pMaxC.id,   dueDate: inOneWeek,  isPublished: true, idx: [0,1,2,3,4] });
  await mkAssignment({ title: "C Lab 2: Count Words in String", problemId: pWordsC.id, dueDate: inTwoWeeks, isPublished: true, idx: [0,1,2,3,4] });

  // C++ labs — students 6–10 (idx 5–9)
  await mkAssignment({ title: "C++ Lab 1: Sort Three Numbers", problemId: pSortCpp.id, dueDate: inOneWeek,  isPublished: true, idx: [5,6,7,8,9] });
  await mkAssignment({ title: "C++ Lab 2: Binary Search",      problemId: pBsCpp.id,   dueDate: inOneMonth, isPublished: true, idx: [5,6,7,8,9] });

  // JavaScript labs — odd-indexed students
  await mkAssignment({ title: "JS Lab 1: FizzBuzz",  problemId: pFizzJs.id, dueDate: inOneWeek,  isPublished: true, idx: [0,2,4,6,8] });
  await mkAssignment({ title: "JS Lab 2: Array Sum", problemId: pArrJs.id,  dueDate: inTwoWeeks, isPublished: true, idx: [0,2,4,6,8] });

  // C# lab — even-indexed students
  await mkAssignment({ title: "C# Lab: Temperature Converter", problemId: pTempCs.id, dueDate: inOneMonth, isPublished: true, idx: [1,3,5,7,9] });

  // Multi-file demo assignment — all students enrolled so the feature is easy to show
  await mkAssignment({
    title: "Demo: Multi-File Editor",
    description: "Open this assignment as a student and use the + tab button to add a second file. Write helper functions in one tab and your main logic in another — both tabs are merged when you Run or Submit.",
    problemId: pMultiFile.id,
    dueDate: inOneMonth,
    isPublished: true,
    idx: [0,1,2,3,4,5,6,7,8,9],
  });

  // Draft (unpublished) — demonstrates teacher draft state
  await mkAssignment({ title: "[DRAFT] Demo: Public and Hidden Tests", problemId: pSum.id, dueDate: null, isPublished: false, idx: [] });

  // ── Submissions (populate the grade book & history) ───────────────────────

  const sub1 = await prisma.submission.create({
    data: { userId: students[0].id, problemId: pSum.id,  code: SUM_REF.trim(), language: "python",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 14, memory: 1024 },
  });
  const sub2 = await prisma.submission.create({
    data: { userId: students[0].id, problemId: pPal.id,  code: PAL_REF.trim(), language: "python",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 15, memory: 1100 },
  });
  const sub3 = await prisma.submission.create({
    data: { userId: students[1].id, problemId: pSum.id,  code: SUM_REF.trim(), language: "python",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 16, memory: 1024 },
  });
  const sub4 = await prisma.submission.create({
    data: { userId: students[2].id, problemId: pSum.id,  code: "a,b=map(int,input().split())\nprint(a-b)", language: "python",
            status: "failed", stdout: "Test 1: FAIL", stderr: null, executionTime: 12, memory: 900 },
  });
  const sub5 = await prisma.submission.create({
    data: { userId: students[3].id, problemId: pFizzJs.id, code: JS_FIZZ_REF.trim(), language: "javascript",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 18, memory: 1200 },
  });
  const sub6 = await prisma.submission.create({
    data: { userId: students[4].id, problemId: pFact.id, code: FACT_REF.trim(), language: "python",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 13, memory: 980 },
  });
  const sub7 = await prisma.submission.create({
    data: { userId: students[5].id, problemId: pSortCpp.id, code: CPP_SORT_REF.trim(), language: "cpp",
            status: "accepted", stdout: "All tests passed", stderr: null, executionTime: 22, memory: 1300 },
  });

  // ── SubmissionAttempts ────────────────────────────────────────────────────

  await prisma.submissionAttempt.createMany({
    data: [
      // student1 — sum correct
      { userId: students[0].id, problemId: pSum.id, submissionId: sub1.id,
        mode: "tests", language: "python", sourceCode: SUM_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 14, memoryKb: 1024 },

      // student1 — palindrome correct
      { userId: students[0].id, problemId: pPal.id, submissionId: sub2.id,
        mode: "tests", language: "python", sourceCode: PAL_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 15, memoryKb: 1100 },

      // student1 — raw run
      { userId: students[0].id, problemId: null, submissionId: null,
        mode: "raw", language: "python", sourceCode: "print('hello world')",
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: null, publicTotal: null, hiddenPassed: null, hiddenTotal: null, allPassed: true,
        stdout: "hello world\n", stderr: null, compileOutput: null, executionTimeMs: 8, memoryKb: 512 },

      // student2 — sum correct
      { userId: students[1].id, problemId: pSum.id, submissionId: sub3.id,
        mode: "tests", language: "python", sourceCode: SUM_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 16, memoryKb: 1024 },

      // student3 — sum wrong answer
      { userId: students[2].id, problemId: pSum.id, submissionId: sub4.id,
        mode: "tests", language: "python", sourceCode: "a,b=map(int,input().split())\nprint(a-b)",
        judge0Status: "Wrong Answer", normalizedStatus: "wrong_answer",
        publicPassed: 0, publicTotal: 2, hiddenPassed: 0, hiddenTotal: 1, allPassed: false,
        stdout: "-1", stderr: null, compileOutput: null, executionTimeMs: 12, memoryKb: 900 },

      // student3 — compile error attempt
      { userId: students[2].id, problemId: pSum.id, submissionId: null,
        mode: "tests", language: "python", sourceCode: "print(a + b",
        judge0Status: "Compilation Error", normalizedStatus: "compile_error",
        publicPassed: 0, publicTotal: 2, hiddenPassed: 0, hiddenTotal: 1, allPassed: false,
        stdout: null, stderr: null, compileOutput: "SyntaxError: unexpected EOF while parsing",
        executionTimeMs: 0, memoryKb: 0 },

      // student4 — FizzBuzz correct (JavaScript)
      { userId: students[3].id, problemId: pFizzJs.id, submissionId: sub5.id,
        mode: "tests", language: "javascript", sourceCode: JS_FIZZ_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 18, memoryKb: 1200 },

      // student5 — factorial runtime error
      { userId: students[4].id, problemId: pFact.id, submissionId: null,
        mode: "tests", language: "python", sourceCode: "n = int(input())\nprint(1/0)",
        judge0Status: "Runtime Error", normalizedStatus: "runtime_error",
        publicPassed: 0, publicTotal: 2, hiddenPassed: 0, hiddenTotal: 1, allPassed: false,
        stdout: null, stderr: "ZeroDivisionError: division by zero", compileOutput: null,
        executionTimeMs: 10, memoryKb: 800 },

      // student5 — factorial correct (second attempt)
      { userId: students[4].id, problemId: pFact.id, submissionId: sub6.id,
        mode: "tests", language: "python", sourceCode: FACT_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 13, memoryKb: 980 },

      // student6 — C++ sort correct
      { userId: students[5].id, problemId: pSortCpp.id, submissionId: sub7.id,
        mode: "tests", language: "cpp", sourceCode: CPP_SORT_REF.trim(),
        judge0Status: "Accepted", normalizedStatus: "accepted",
        publicPassed: 2, publicTotal: 2, hiddenPassed: 1, hiddenTotal: 1, allPassed: true,
        stdout: "All tests passed", stderr: null, compileOutput: null, executionTimeMs: 22, memoryKb: 1300 },
    ],
  });

  console.log("✅  Seed completed successfully.\n");
  console.log("  Accounts (password: 123456)");
  console.log("  ─────────────────────────────────────────");
  console.log("  teacher1@demo.com   → Teacher");
  console.log("  admin1@demo.com     → Admin");
  studentDefs.forEach((s) => console.log(`  ${s.email.padEnd(24)} → ${s.name}`));
  console.log(`\n  Problems   : 14  (Python×5, C×2, C++×2, JS×2, C#×1, Multi-file demo×1, Demo×1)`);
  console.log(`  Assignments: 14  (13 published, 1 draft)`);
  console.log(`  Submissions: 7   (accepted, wrong_answer, compile_error, runtime_error)`);
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
