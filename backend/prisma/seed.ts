import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in .env");
}

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pgPool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
const prisma  = new PrismaClient({ adapter }) as unknown as PrismaClient;

// ═══════════════════════════════════════════════════════════════════════════════
// PROBLEM CONTENT
// 15 language-specific problems (Easy / Medium / Hard per language)
// + 1 universal problem (all languages, Medium)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Python — Easy ─────────────────────────────────────────────────────────────
const PY_DIGITS_DESC = `Read a non-negative integer and print the **sum of its digits**.

**Example:**
- Input: \`1234\`
- Output: \`10\`  (1 + 2 + 3 + 4 = 10)`;

const PY_DIGITS_STARTER = `n = input().strip()
# Print the sum of the digits of the number
`;

const PY_DIGITS_REF = `n = input().strip()
print(sum(int(d) for d in n))
`;

// ── Python — Medium ────────────────────────────────────────────────────────────
const PY_VOWELS_DESC = `Read a line of text and print the number of **vowels** it contains.
Vowels are: **a, e, i, o, u** (case-insensitive).

**Example:**
- Input: \`Hello World\`
- Output: \`3\`  (e, o, o)`;

const PY_VOWELS_STARTER = `line = input()
# Count and print the number of vowels (a, e, i, o, u) — case-insensitive
`;

const PY_VOWELS_REF = `line = input()
print(sum(1 for c in line.lower() if c in 'aeiou'))
`;

// ── Python — Hard ──────────────────────────────────────────────────────────────
const PY_STOCK_DESC = `You are given the daily prices of a stock over N days. You may **buy on one day** and **sell on a strictly later day**. Find the **maximum profit** from a single buy-sell transaction. If no profit is possible, print \`0\`.

**Input format:**
- Line 1: N
- Line 2: N space-separated integers (prices)

**Example 1:**
\`\`\`
5
7 1 5 3 6
\`\`\`
Output: \`5\`  (buy at 1, sell at 6)

**Example 2:**
\`\`\`
5
7 6 4 3 1
\`\`\`
Output: \`0\`  (prices only decrease — no profitable trade)`;

const PY_STOCK_STARTER = `n = int(input())
prices = list(map(int, input().split()))
# Find and print the maximum profit from one buy-sell transaction
`;

const PY_STOCK_REF = `n = int(input())
prices = list(map(int, input().split()))
min_price = prices[0]
max_profit = 0
for p in prices[1:]:
    max_profit = max(max_profit, p - min_price)
    min_price = min(min_price, p)
print(max_profit)
`;

// ── JavaScript — Easy ──────────────────────────────────────────────────────────
const JS_REV_DESC = `Read a string and print it **reversed**.

**Examples:**
- Input: \`hello\` → Output: \`olleh\`
- Input: \`racecar\` → Output: \`racecar\``;

const JS_REV_STARTER = `const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
// Print the string reversed
`;

const JS_REV_REF = `const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
console.log(s.split('').reverse().join(''));
`;

// ── JavaScript — Medium ────────────────────────────────────────────────────────
const JS_MISSING_DESC = `You are given N−1 distinct integers taken from the range 1 to N — exactly **one number is missing**. Find and print it.

**Input format:**
- Line 1: N
- Line 2: N−1 space-separated integers

**Example:**
\`\`\`
5
1 2 4 5
\`\`\`
Output: \`3\`

**Hint:** The sum of integers from 1 to N is N × (N + 1) / 2.`;

const JS_MISSING_STARTER = `const lines = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split('\\n');
const n = parseInt(lines[0]);
const nums = lines[1].split(' ').map(Number);
// Find and print the missing number
`;

const JS_MISSING_REF = `const lines = require('fs').readFileSync('/dev/stdin', 'utf8').trim().split('\\n');
const n = parseInt(lines[0]);
const nums = lines[1].split(' ').map(Number);
const expected = n * (n + 1) / 2;
const actual = nums.reduce((a, b) => a + b, 0);
console.log(expected - actual);
`;

// ── JavaScript — Hard ──────────────────────────────────────────────────────────
const JS_PAREN_DESC = `Given a string containing only the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\`, \`]\`, determine whether the brackets are **valid**.

A string is valid when:
- Every opening bracket is closed by the **same type** of closing bracket.
- Brackets are closed in the **correct order**.

Print \`true\` if valid, \`false\` otherwise.

**Examples:**
- \`()[]{}\` → \`true\`
- \`([)]\` → \`false\`
- \`{[()]}\` → \`true\`
- \`(((\` → \`false\``;

const JS_PAREN_STARTER = `const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
// Check if the brackets in s are valid and print true or false
`;

const JS_PAREN_REF = `const s = require('fs').readFileSync('/dev/stdin', 'utf8').trim();
const stack = [];
const map = { ')': '(', '}': '{', ']': '[' };
for (const c of s) {
    if ('({['.includes(c)) stack.push(c);
    else {
        if (stack.pop() !== map[c]) { console.log('false'); process.exit(); }
    }
}
console.log(stack.length === 0 ? 'true' : 'false');
`;

// ── C — Easy ───────────────────────────────────────────────────────────────────
const C_GCD_DESC = `Read two positive integers and print their **Greatest Common Divisor (GCD)**.

**Example:**
- Input: \`48 18\`
- Output: \`6\`

**Hint:** Use the Euclidean algorithm: GCD(a, b) = GCD(b, a mod b), where GCD(a, 0) = a.`;

const C_GCD_STARTER = `#include <stdio.h>

int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    // Compute and print GCD(a, b)

    return 0;
}
`;

const C_GCD_REF = `#include <stdio.h>
int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", gcd(a, b));
    return 0;
}
`;

// ── C — Medium ─────────────────────────────────────────────────────────────────
const C_PRIME_DESC = `Read a positive integer N (N ≥ 2). Print \`prime\` if it is a prime number, or \`not prime\` otherwise.

A **prime number** is divisible only by 1 and itself.

**Examples:**
- Input: \`17\` → Output: \`prime\`
- Input: \`12\` → Output: \`not prime\``;

const C_PRIME_STARTER = `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    // Determine if n is prime and print "prime" or "not prime"

    return 0;
}
`;

const C_PRIME_REF = `#include <stdio.h>
int main() {
    int n; scanf("%d", &n);
    int prime = 1;
    for (int i = 2; (long long)i * i <= n; i++)
        if (n % i == 0) { prime = 0; break; }
    printf("%s\\n", prime ? "prime" : "not prime");
    return 0;
}
`;

// ── C — Hard ───────────────────────────────────────────────────────────────────
const C_SELSORT_DESC = `Read N integers and sort them in **ascending order** using the **Selection Sort** algorithm. Print the sorted numbers space-separated on a single line.

**Input format:**
- Line 1: N
- Line 2: N space-separated integers

**Example:**
\`\`\`
5
64 25 12 22 11
\`\`\`
Output: \`11 12 22 25 64\`

**Note:** Implement Selection Sort from scratch — do not use any library sort function.`;

const C_SELSORT_STARTER = `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    int arr[1000];
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);

    // Implement Selection Sort here

    for (int i = 0; i < n; i++) {
        printf("%d", arr[i]);
        if (i < n - 1) printf(" ");
    }
    printf("\\n");
    return 0;
}
`;

const C_SELSORT_REF = `#include <stdio.h>
int main() {
    int n; scanf("%d", &n);
    int arr[1000];
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++)
            if (arr[j] < arr[minIdx]) minIdx = j;
        int tmp = arr[i]; arr[i] = arr[minIdx]; arr[minIdx] = tmp;
    }
    for (int i = 0; i < n; i++) {
        printf("%d", arr[i]);
        if (i < n - 1) printf(" ");
    }
    printf("\\n");
    return 0;
}
`;

// ── C++ — Easy ─────────────────────────────────────────────────────────────────
const CPP_EVEN_DESC = `Read N integers and print the **sum of all even numbers** among them. If there are no even numbers, print \`0\`.

**Input format:**
- Line 1: N
- Line 2: N space-separated integers

**Example:**
\`\`\`
6
1 2 3 4 5 6
\`\`\`
Output: \`12\`  (2 + 4 + 6 = 12)`;

const CPP_EVEN_STARTER = `#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;
    // Read n integers and print the sum of the even ones

    return 0;
}
`;

const CPP_EVEN_REF = `#include <iostream>
using namespace std;
int main() {
    int n; cin >> n;
    long long sum = 0;
    for (int i = 0; i < n; i++) {
        int x; cin >> x;
        if (x % 2 == 0) sum += x;
    }
    cout << sum << endl;
    return 0;
}
`;

// ── C++ — Medium ───────────────────────────────────────────────────────────────
const CPP_DEDUP_DESC = `Given a **sorted** array of N integers, print the array with all **duplicate values removed**. Output the remaining numbers space-separated on one line.

**Input format:**
- Line 1: N
- Line 2: N sorted space-separated integers

**Example:**
\`\`\`
7
1 1 2 3 3 4 5
\`\`\`
Output: \`1 2 3 4 5\``;

const CPP_DEDUP_STARTER = `#include <iostream>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    // Print the array without duplicates

    return 0;
}
`;

const CPP_DEDUP_REF = `#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    bool first = true;
    for (int i = 0; i < n; i++) {
        if (i == 0 || arr[i] != arr[i - 1]) {
            if (!first) cout << " ";
            cout << arr[i];
            first = false;
        }
    }
    cout << endl;
    return 0;
}
`;

// ── C++ — Hard ─────────────────────────────────────────────────────────────────
const CPP_LIS_DESC = `Find the **length of the Longest Strictly Increasing Subsequence (LIS)** of an array of N integers.

A subsequence is obtained by deleting some elements (possibly none) without changing the order. "Strictly increasing" means each element is **greater than** the previous.

**Input format:**
- Line 1: N
- Line 2: N space-separated integers

**Example 1:**
\`\`\`
8
10 9 2 5 3 7 101 18
\`\`\`
Output: \`4\`  (one LIS: 2 → 3 → 7 → 101)

**Example 2:**
\`\`\`
4
4 3 2 1
\`\`\`
Output: \`1\`  (each element is its own LIS)`;

const CPP_LIS_STARTER = `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    // Find and print the length of the longest strictly increasing subsequence

    return 0;
}
`;

const CPP_LIS_REF = `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];
    vector<int> dp(n, 1);
    for (int i = 1; i < n; i++)
        for (int j = 0; j < i; j++)
            if (arr[j] < arr[i]) dp[i] = max(dp[i], dp[j] + 1);
    cout << *max_element(dp.begin(), dp.end()) << endl;
    return 0;
}
`;

// ── C# — Easy ──────────────────────────────────────────────────────────────────
const CS_BIN_DESC = `Read a **binary string** (containing only \`0\`s and \`1\`s) and print its **decimal (base-10) equivalent**.

**Examples:**
- Input: \`1010\` → Output: \`10\`
- Input: \`1111\` → Output: \`15\`
- Input: \`0\` → Output: \`0\``;

const CS_BIN_STARTER = `using System;

class Program {
    static void Main(string[] args) {
        string binary = Console.ReadLine().Trim();
        // Convert the binary string to decimal and print it

    }
}
`;

const CS_BIN_REF = `using System;
class Program {
    static void Main(string[] args) {
        string binary = Console.ReadLine().Trim();
        Console.WriteLine(Convert.ToInt32(binary, 2));
    }
}
`;

// ── C# — Medium ────────────────────────────────────────────────────────────────
const CS_CAESAR_DESC = `Implement the **Caesar Cipher** encryption.

Read a shift amount K and a message. Shift each **letter** forward by K positions in the alphabet (wrapping around Z → A). Non-letter characters stay unchanged. Preserve the original case.

**Input format:**
- Line 1: K (integer; may be larger than 26 or negative)
- Line 2: the message

**Example:**
\`\`\`
3
Hello, World!
\`\`\`
Output: \`Khoor, Zruog!\``;

const CS_CAESAR_STARTER = `using System;

class Program {
    static void Main(string[] args) {
        int k = int.Parse(Console.ReadLine().Trim()) % 26;
        if (k < 0) k += 26;
        string message = Console.ReadLine();
        // Encrypt the message using the Caesar cipher with shift k

    }
}
`;

const CS_CAESAR_REF = `using System;
class Program {
    static void Main(string[] args) {
        int k = int.Parse(Console.ReadLine().Trim()) % 26;
        if (k < 0) k += 26;
        string message = Console.ReadLine();
        char[] result = message.ToCharArray();
        for (int i = 0; i < result.Length; i++) {
            if (char.IsLetter(result[i])) {
                char baseChar = char.IsUpper(result[i]) ? 'A' : 'a';
                result[i] = (char)((result[i] - baseChar + k) % 26 + baseChar);
            }
        }
        Console.WriteLine(new string(result));
    }
}
`;

// ── C# — Hard ──────────────────────────────────────────────────────────────────
const CS_DIAG_DESC = `Read an N×N square matrix and print the **sum of the primary diagonal** and the **sum of the secondary diagonal**, separated by a space.

- **Primary diagonal**: elements at positions [i][i] (top-left → bottom-right)
- **Secondary diagonal**: elements at positions [i][N−1−i] (top-right → bottom-left)

**Input format:**
- Line 1: N
- Lines 2 … N+1: N space-separated integers per row

**Example:**
\`\`\`
3
1 2 3
4 5 6
7 8 9
\`\`\`
Output: \`15 15\`
(Primary: 1+5+9 = 15 | Secondary: 3+5+7 = 15)`;

const CS_DIAG_STARTER = `using System;

class Program {
    static void Main(string[] args) {
        int n = int.Parse(Console.ReadLine().Trim());
        int[,] matrix = new int[n, n];
        for (int i = 0; i < n; i++) {
            string[] parts = Console.ReadLine().Trim().Split(' ');
            for (int j = 0; j < n; j++)
                matrix[i, j] = int.Parse(parts[j]);
        }
        // Compute and print primary and secondary diagonal sums, space-separated

    }
}
`;

const CS_DIAG_REF = `using System;
class Program {
    static void Main(string[] args) {
        int n = int.Parse(Console.ReadLine().Trim());
        int[,] m = new int[n, n];
        for (int i = 0; i < n; i++) {
            string[] parts = Console.ReadLine().Trim().Split(' ');
            for (int j = 0; j < n; j++) m[i, j] = int.Parse(parts[j]);
        }
        int primary = 0, secondary = 0;
        for (int i = 0; i < n; i++) {
            primary   += m[i, i];
            secondary += m[i, n - 1 - i];
        }
        Console.WriteLine(primary + " " + secondary);
    }
}
`;

// ── Universal — Medium (all languages) ────────────────────────────────────────
const UNI_COLLATZ_DESC = `The **Collatz Sequence** (3n+1 problem) starts from a positive integer N and applies these rules repeatedly:
- If N is **even** → next = N / 2
- If N is **odd**  → next = 3 × N + 1

The sequence ends when it reaches **1**.

Read a positive integer N and print the **entire Collatz sequence** from N to 1, all numbers **space-separated** on one line.

**Example 1:**
- Input: \`6\`
- Output: \`6 3 10 5 16 8 4 2 1\`

**Example 2:**
- Input: \`1\`
- Output: \`1\`

This problem is designed to be solved in **any language**: Python, JavaScript, C, C++, or C#.`;

const UNI_COLLATZ_STARTER = `n = int(input())
result = []
# Build the Collatz sequence from n down to 1, then print space-separated
`;

const UNI_COLLATZ_REF = `n = int(input())
result = []
while n != 1:
    result.append(n)
    n = n // 2 if n % 2 == 0 else 3 * n + 1
result.append(1)
print(*result)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type TestSpec = { input: string; expectedOutput: string; isHidden: boolean };

async function createProblem(params: {
  title: string;
  description: string;
  starterCode: string;
  referenceSolution: string;
  difficulty: string;
  language: string;
  languages?: string[];
  tags: string[];
  category: string;
  createdById: number;
  testCases: TestSpec[];
}) {
  return prisma.problem.create({
    data: {
      title:             params.title,
      description:       params.description,
      starterCode:       params.starterCode,
      referenceSolution: params.referenceSolution,
      difficulty:        params.difficulty,
      language:          params.language,
      languages:         params.languages ?? [],
      tags:              params.tags,
      category:          params.category,
      createdBy:         { connect: { id: params.createdById } },
      testCases:         { create: params.testCases },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE RESET
// Deletes all transactional data while preserving users and roles.
// Order respects foreign-key dependencies (children before parents).
// ─────────────────────────────────────────────────────────────────────────────
async function cleanDatabase() {
  await prisma.hintEvent.deleteMany();
  await prisma.aIInteractionAudit.deleteMany();
  await prisma.aiLog.deleteMany();
  await prisma.submissionAttempt.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.assignmentEnrollment.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.problemVariation.deleteMany();
  await prisma.problem.deleteMany();           // cascades → TestCase, Rubric
  await prisma.studentGroupMembership.deleteMany();
  await prisma.studentGroup.deleteMany();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {

  // ── Roles (idempotent) ─────────────────────────────────────────────────────
  const studentRole = await prisma.role.upsert({ where: { name: "student" }, update: {}, create: { name: "student" } });
  const teacherRole = await prisma.role.upsert({ where: { name: "teacher" }, update: {}, create: { name: "teacher" } });
  const adminRole   = await prisma.role.upsert({ where: { name: "admin"   }, update: {}, create: { name: "admin"   } });

  const pw = await bcrypt.hash("123456", 10);

  // ── Users (upsert — never deleted) ────────────────────────────────────────
  const teacher = await prisma.user.upsert({
    where:  { email: "teacher1@demo.com" },
    update: { name: "Teacher Demo", passwordHash: pw, roleId: teacherRole.id },
    create: { name: "Teacher Demo", email: "teacher1@demo.com", passwordHash: pw, roleId: teacherRole.id },
  });

  await prisma.user.upsert({
    where:  { email: "admin1@demo.com" },
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

  await Promise.all(
    studentDefs.map((s) =>
      prisma.user.upsert({
        where:  { email: s.email },
        update: { name: s.name, passwordHash: pw, roleId: studentRole.id },
        create: { name: s.name, email: s.email, passwordHash: pw, roleId: studentRole.id },
      }),
    ),
  );

  // ── System flags ───────────────────────────────────────────────────────────
  await prisma.systemFlag.upsert({
    where:  { key: "exam_mode_enabled" },
    update: { value: { enabled: false, groupIds: [] } },
    create: { key: "exam_mode_enabled", value: { enabled: false, groupIds: [] } },
  });

  // ── Wipe all transactional data ────────────────────────────────────────────
  console.log("  Cleaning database…");
  await cleanDatabase();

  // ── Question Bank ──────────────────────────────────────────────────────────
  console.log("  Seeding problems…\n");

  // ─── Python ───────────────────────────────────────────────────────────────

  await createProblem({
    title: "Sum of Digits",
    description: PY_DIGITS_DESC,
    starterCode: PY_DIGITS_STARTER,
    referenceSolution: PY_DIGITS_REF,
    difficulty: "Easy", language: "python",
    tags: ["math", "digits", "basics"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "1234", expectedOutput: "10",  isHidden: false },
      { input: "0",    expectedOutput: "0",   isHidden: false },
      { input: "999",  expectedOutput: "27",  isHidden: true  },
      { input: "100",  expectedOutput: "1",   isHidden: true  },
    ],
  });

  await createProblem({
    title: "Count Vowels in a String",
    description: PY_VOWELS_DESC,
    starterCode: PY_VOWELS_STARTER,
    referenceSolution: PY_VOWELS_REF,
    difficulty: "Medium", language: "python",
    tags: ["strings", "counting", "loops"], category: "Strings",
    createdById: teacher.id,
    testCases: [
      { input: "Hello World",        expectedOutput: "3", isHidden: false },
      { input: "aeiou",              expectedOutput: "5", isHidden: false },
      { input: "rhythm",             expectedOutput: "0", isHidden: true  },
      { input: "Programming is fun", expectedOutput: "5", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Maximum Profit from Stock Prices",
    description: PY_STOCK_DESC,
    starterCode: PY_STOCK_STARTER,
    referenceSolution: PY_STOCK_REF,
    difficulty: "Hard", language: "python",
    tags: ["arrays", "greedy", "algorithms"], category: "Algorithms",
    createdById: teacher.id,
    testCases: [
      { input: "5\n7 1 5 3 6", expectedOutput: "5", isHidden: false },
      { input: "5\n7 6 4 3 1", expectedOutput: "0", isHidden: false },
      { input: "3\n1 2 3",     expectedOutput: "2", isHidden: true  },
      { input: "4\n3 3 3 3",   expectedOutput: "0", isHidden: true  },
    ],
  });

  // ─── JavaScript ───────────────────────────────────────────────────────────

  await createProblem({
    title: "Reverse a String",
    description: JS_REV_DESC,
    starterCode: JS_REV_STARTER,
    referenceSolution: JS_REV_REF,
    difficulty: "Easy", language: "javascript",
    tags: ["strings", "basics"], category: "Strings",
    createdById: teacher.id,
    testCases: [
      { input: "hello",   expectedOutput: "olleh",   isHidden: false },
      { input: "abcde",   expectedOutput: "edcba",   isHidden: false },
      { input: "racecar", expectedOutput: "racecar", isHidden: true  },
      { input: "OpenAI",  expectedOutput: "IAnepO",  isHidden: true  },
    ],
  });

  await createProblem({
    title: "Find the Missing Number",
    description: JS_MISSING_DESC,
    starterCode: JS_MISSING_STARTER,
    referenceSolution: JS_MISSING_REF,
    difficulty: "Medium", language: "javascript",
    tags: ["math", "arrays"], category: "Math",
    createdById: teacher.id,
    testCases: [
      { input: "5\n1 2 4 5",    expectedOutput: "3", isHidden: false },
      { input: "3\n1 3",        expectedOutput: "2", isHidden: false },
      { input: "6\n1 2 3 4 6",  expectedOutput: "5", isHidden: true  },
      { input: "2\n1",          expectedOutput: "2", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Valid Parentheses",
    description: JS_PAREN_DESC,
    starterCode: JS_PAREN_STARTER,
    referenceSolution: JS_PAREN_REF,
    difficulty: "Hard", language: "javascript",
    tags: ["stack", "data-structures", "strings"], category: "Data Structures",
    createdById: teacher.id,
    testCases: [
      { input: "()[]{}",  expectedOutput: "true",  isHidden: false },
      { input: "([)]",    expectedOutput: "false",  isHidden: false },
      { input: "{[()]}",  expectedOutput: "true",  isHidden: true  },
      { input: "(((", expectedOutput: "false", isHidden: true  },
    ],
  });

  // ─── C ────────────────────────────────────────────────────────────────────

  await createProblem({
    title: "GCD of Two Numbers",
    description: C_GCD_DESC,
    starterCode: C_GCD_STARTER,
    referenceSolution: C_GCD_REF,
    difficulty: "Easy", language: "c",
    tags: ["math", "recursion"], category: "Math",
    createdById: teacher.id,
    testCases: [
      { input: "48 18",  expectedOutput: "6",  isHidden: false },
      { input: "100 75", expectedOutput: "25", isHidden: false },
      { input: "7 13",   expectedOutput: "1",  isHidden: true  },
      { input: "36 60",  expectedOutput: "12", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Check Prime Number",
    description: C_PRIME_DESC,
    starterCode: C_PRIME_STARTER,
    referenceSolution: C_PRIME_REF,
    difficulty: "Medium", language: "c",
    tags: ["math", "loops"], category: "Math",
    createdById: teacher.id,
    testCases: [
      { input: "17",  expectedOutput: "prime",     isHidden: false },
      { input: "12",  expectedOutput: "not prime", isHidden: false },
      { input: "2",   expectedOutput: "prime",     isHidden: true  },
      { input: "100", expectedOutput: "not prime", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Selection Sort",
    description: C_SELSORT_DESC,
    starterCode: C_SELSORT_STARTER,
    referenceSolution: C_SELSORT_REF,
    difficulty: "Hard", language: "c",
    tags: ["sorting", "algorithms", "arrays"], category: "Sorting",
    createdById: teacher.id,
    testCases: [
      { input: "5\n64 25 12 22 11", expectedOutput: "11 12 22 25 64", isHidden: false },
      { input: "3\n3 1 2",          expectedOutput: "1 2 3",          isHidden: false },
      { input: "4\n-5 3 -1 0",      expectedOutput: "-5 -1 0 3",      isHidden: true  },
      { input: "1\n42",             expectedOutput: "42",             isHidden: true  },
    ],
  });

  // ─── C++ ──────────────────────────────────────────────────────────────────

  await createProblem({
    title: "Sum of Even Numbers in Array",
    description: CPP_EVEN_DESC,
    starterCode: CPP_EVEN_STARTER,
    referenceSolution: CPP_EVEN_REF,
    difficulty: "Easy", language: "cpp",
    tags: ["arrays", "loops", "math"], category: "Arrays",
    createdById: teacher.id,
    testCases: [
      { input: "6\n1 2 3 4 5 6",   expectedOutput: "12", isHidden: false },
      { input: "4\n1 3 5 7",        expectedOutput: "0",  isHidden: false },
      { input: "3\n2 4 6",          expectedOutput: "12", isHidden: true  },
      { input: "5\n10 -4 3 7 2",   expectedOutput: "8",  isHidden: true  },
    ],
  });

  await createProblem({
    title: "Remove Duplicates from Sorted Array",
    description: CPP_DEDUP_DESC,
    starterCode: CPP_DEDUP_STARTER,
    referenceSolution: CPP_DEDUP_REF,
    difficulty: "Medium", language: "cpp",
    tags: ["arrays", "sorting"], category: "Arrays",
    createdById: teacher.id,
    testCases: [
      { input: "7\n1 1 2 3 3 4 5",  expectedOutput: "1 2 3 4 5",   isHidden: false },
      { input: "5\n1 1 1 1 1",       expectedOutput: "1",           isHidden: false },
      { input: "4\n1 2 3 4",         expectedOutput: "1 2 3 4",     isHidden: true  },
      { input: "6\n-3 -1 0 0 2 4",   expectedOutput: "-3 -1 0 2 4", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Longest Increasing Subsequence",
    description: CPP_LIS_DESC,
    starterCode: CPP_LIS_STARTER,
    referenceSolution: CPP_LIS_REF,
    difficulty: "Hard", language: "cpp",
    tags: ["dynamic-programming", "arrays", "algorithms"], category: "Dynamic Programming",
    createdById: teacher.id,
    testCases: [
      { input: "8\n10 9 2 5 3 7 101 18", expectedOutput: "4", isHidden: false },
      { input: "5\n3 10 2 1 20",          expectedOutput: "3", isHidden: false },
      { input: "3\n1 2 3",                expectedOutput: "3", isHidden: true  },
      { input: "4\n4 3 2 1",              expectedOutput: "1", isHidden: true  },
    ],
  });

  // ─── C# ───────────────────────────────────────────────────────────────────

  await createProblem({
    title: "Binary to Decimal Conversion",
    description: CS_BIN_DESC,
    starterCode: CS_BIN_STARTER,
    referenceSolution: CS_BIN_REF,
    difficulty: "Easy", language: "csharp",
    tags: ["math", "conversion", "basics"], category: "Fundamentals",
    createdById: teacher.id,
    testCases: [
      { input: "1010",     expectedOutput: "10",  isHidden: false },
      { input: "1111",     expectedOutput: "15",  isHidden: false },
      { input: "0",        expectedOutput: "0",   isHidden: true  },
      { input: "11010011", expectedOutput: "211", isHidden: true  },
    ],
  });

  await createProblem({
    title: "Caesar Cipher Encryption",
    description: CS_CAESAR_DESC,
    starterCode: CS_CAESAR_STARTER,
    referenceSolution: CS_CAESAR_REF,
    difficulty: "Medium", language: "csharp",
    tags: ["strings", "encryption", "algorithms"], category: "Strings",
    createdById: teacher.id,
    testCases: [
      { input: "3\nHello, World!", expectedOutput: "Khoor, Zruog!", isHidden: false },
      { input: "0\nABC",          expectedOutput: "ABC",           isHidden: false },
      { input: "1\nzebra",        expectedOutput: "afcsb",         isHidden: true  },
      { input: "26\nTest",        expectedOutput: "Test",          isHidden: true  },
    ],
  });

  await createProblem({
    title: "Matrix Diagonal Sums",
    description: CS_DIAG_DESC,
    starterCode: CS_DIAG_STARTER,
    referenceSolution: CS_DIAG_REF,
    difficulty: "Hard", language: "csharp",
    tags: ["arrays", "matrix", "math"], category: "Arrays",
    createdById: teacher.id,
    testCases: [
      { input: "3\n1 2 3\n4 5 6\n7 8 9", expectedOutput: "15 15", isHidden: false },
      { input: "2\n1 2\n3 4",             expectedOutput: "5 5",   isHidden: false },
      { input: "2\n5 3\n2 7",             expectedOutput: "12 5",  isHidden: true  },
      { input: "3\n1 0 0\n0 1 0\n0 0 1", expectedOutput: "3 1",   isHidden: true  },
    ],
  });

  // ─── Universal (all languages) ─────────────────────────────────────────────

  await createProblem({
    title: "Collatz Sequence",
    description: UNI_COLLATZ_DESC,
    starterCode: UNI_COLLATZ_STARTER,
    referenceSolution: UNI_COLLATZ_REF,
    difficulty: "Medium",
    language: "python",
    languages: ["python", "javascript", "c", "cpp", "csharp"],
    tags: ["loops", "conditionals", "math"], category: "Algorithms",
    createdById: teacher.id,
    testCases: [
      { input: "6",  expectedOutput: "6 3 10 5 16 8 4 2 1",          isHidden: false },
      { input: "1",  expectedOutput: "1",                             isHidden: false },
      { input: "12", expectedOutput: "12 6 3 10 5 16 8 4 2 1",       isHidden: true  },
      { input: "8",  expectedOutput: "8 4 2 1",                      isHidden: true  },
    ],
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║              Seed completed successfully             ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  Accounts (password: 123456)                         ║");
  console.log("║  ─────────────────────────────────────────────────── ║");
  console.log("║  teacher1@demo.com        → Teacher Demo             ║");
  console.log("║  admin1@demo.com          → Admin Demo               ║");
  studentDefs.forEach((s) =>
    console.log(`║  ${s.email.padEnd(26)} → ${s.name.padEnd(20)} ║`),
  );
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  Question Bank (16 problems)                         ║");
  console.log("║  Python     Easy / Medium / Hard                     ║");
  console.log("║  JavaScript Easy / Medium / Hard                     ║");
  console.log("║  C          Easy / Medium / Hard                     ║");
  console.log("║  C++        Easy / Medium / Hard                     ║");
  console.log("║  C#         Easy / Medium / Hard                     ║");
  console.log("║  Universal  Medium (all languages)                   ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log("║  Assignments : 0   (create manually as teacher)      ║");
  console.log("║  Groups      : 0   (create manually as teacher)      ║");
  console.log("║  Submissions : 0   (clean slate)                     ║");
  console.log("╚══════════════════════════════════════════════════════╝");
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
