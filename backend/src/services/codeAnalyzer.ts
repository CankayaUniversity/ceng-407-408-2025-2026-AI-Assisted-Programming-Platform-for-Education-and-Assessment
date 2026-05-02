/**
 * codeAnalyzer.ts
 *
 * Lightweight structural analysis of a reference solution.
 * Used by variationService.ts to ground AI variation generation in the
 * actual algorithmic structure of the code rather than just its description.
 *
 * Approach: regex-based pattern detection across all supported languages
 * (Python, JavaScript, C, C++, C#, Java). No external AST library is
 * required, keeping the backend dependency-free for this feature.
 *
 * Extracts:
 *   - Loop types and nesting depth
 *   - Conditional complexity
 *   - Recursion (function calling itself by name)
 *   - Data structure usage (array, map/dict, set, stack, queue)
 *   - Algorithm patterns (sorting, binary search, two-pointer, etc.)
 *   - Estimated Big-O complexity
 *   - A human-readable narrative for the AI prompt
 */

export type CodeStructure = {
  loops: {
    forCount:    number;
    whileCount:  number;
    doWhile:     boolean;
    maxNesting:  number;   // deepest nesting level of any loop
  };
  conditionals: {
    ifCount:     number;
    switchCount: number;
    ternary:     boolean;
  };
  recursion:       boolean;
  dataStructures:  string[];   // e.g. ["array", "hashmap", "set"]
  algorithmHints:  string[];   // e.g. ["sorting", "binary search"]
  complexity:      string;     // estimated Big-O as a string
  narrative:       string;     // 2–4 sentence plain-English summary
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function countMatches(code: string, pattern: RegExp): number {
  return (code.match(pattern) ?? []).length;
}

/** Strip string literals and comments to avoid false positives in regex scans. */
function stripStringsAndComments(code: string): string {
  // Remove block comments /* … */
  let s = code.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Remove line comments // … and # …
  s = s.replace(/\/\/[^\n]*/g, " ").replace(/#[^\n]*/g, " ");
  // Remove double-quoted strings (simple, no escape handling)
  s = s.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""');
  // Remove single-quoted strings
  s = s.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''");
  return s;
}

/** Estimate the deepest loop nesting level using brace/indent counting. */
function estimateMaxLoopNesting(code: string, language: string): number {
  const loopPattern = /\b(for|while|foreach)\s*[\s\S]*?[({]/g;
  let maxDepth = 0;
  let currentDepth = 0;

  if (["python"].includes(language.toLowerCase())) {
    // Python: count indentation of loop keywords
    const lines = code.split("\n");
    const depths: number[] = [];
    for (const line of lines) {
      if (/^\s*(for|while)\s/.test(line)) {
        const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
        depths.push(indent);
      }
    }
    // Nesting level = number of distinct loop indents that are nested inside each other
    if (depths.length > 0) {
      const sorted = [...new Set(depths)].sort((a, b) => a - b);
      maxDepth = sorted.length;
    }
  } else {
    // Brace-based languages: walk char-by-char tracking brace depth at each loop keyword
    const loopRe = /\b(for|while|do)\b/g;
    let m: RegExpExecArray | null;
    while ((m = loopRe.exec(code)) !== null) {
      let depth = 0;
      for (let i = 0; i < m.index; i++) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") depth--;
      }
      if (depth > maxDepth) maxDepth = depth;
    }
  }

  // Cap at a reasonable max for display purposes
  return Math.min(maxDepth, 5);
}

/** Try to detect recursion: a function calling itself by name. */
function detectRecursion(code: string, language: string): boolean {
  const lang = language.toLowerCase();

  // Extract function names defined in the code
  const funcNames: string[] = [];

  if (lang === "python") {
    const re = /def\s+(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) funcNames.push(m[1]);
  } else if (lang === "javascript" || lang === "js") {
    // function foo() or const foo = () => or const foo = function
    const re = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) funcNames.push(m[1] ?? m[2]);
  } else {
    // C, C++, Java, C# — look for return-type funcName( patterns
    const re = /\b\w[\w<>*&\[\]]*\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+\s*)?\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      const name = m[1];
      // Skip common non-recursive keywords
      if (!["if", "for", "while", "switch", "catch", "main"].includes(name)) {
        funcNames.push(name);
      }
    }
  }

  // Check if any function name appears in a call position after its definition
  for (const name of funcNames) {
    const callPattern = new RegExp(`\\b${name}\\s*\\(`, "g");
    const matches = [...code.matchAll(callPattern)];
    // More than one match = defined once + called at least once (recursive)
    if (matches.length >= 2) return true;
  }

  return false;
}

/** Detect which data structures are used. */
function detectDataStructures(code: string, language: string): string[] {
  const lang    = language.toLowerCase();
  const found   = new Set<string>();
  const c       = code.toLowerCase();

  // Arrays / lists (almost universal signal)
  if (
    /\[\s*\]/.test(code) ||
    /new\s+\w+\s*\[/.test(code) ||
    /\.append\(|\.push\(|list\(|ArrayList/.test(code)
  ) found.add("array");

  // Hash map / dictionary
  if (
    /\bdict\b|{\s*[\w'"]+\s*:/.test(code) ||
    /\bMap\b|\bHashMap\b|\bDictionary\b|new Map\(/.test(code) ||
    /\bunordered_map\b|\bmap</.test(c)
  ) found.add("hashmap");

  // Set
  if (
    /\bset\(|\bSet\b|\bHashSet\b|\bunordered_set\b/.test(code) ||
    /new Set\(/.test(code)
  ) found.add("set");

  // Stack (explicit or via push+pop on array)
  if (
    /\bStack\b|\bstack</.test(code) ||
    (/\.push\(/.test(code) && /\.pop\(/.test(code))
  ) found.add("stack");

  // Queue / deque
  if (
    /\bQueue\b|\bDeque\b|\bdeque\b|\bcollections\.deque/.test(code) ||
    /\.enqueue\(|\.dequeue\(/.test(code)
  ) found.add("queue");

  // Heap / priority queue
  if (/\bheapq\b|\bPriorityQueue\b|\bheap_push\b|priority_queue/.test(code)) {
    found.add("heap");
  }

  // Linked list
  if (/ListNode|LinkedList|\.next\s*=/.test(code)) found.add("linked list");

  // Tree / graph
  if (/TreeNode|BinaryTree|\bGraph\b|adjacency/.test(code)) found.add("tree/graph");

  return [...found];
}

/** Detect high-level algorithmic patterns. */
function detectAlgorithmPatterns(code: string): string[] {
  const found = new Set<string>();
  const c     = code.toLowerCase();

  // Sorting
  if (/\.sort\(|\.sorted\(|\bsort\b|\bqsort\b|Arrays\.sort|Collections\.sort/.test(c)) {
    found.add("sorting");
  }

  // Binary search
  if (
    /binary.?search|bisect|bsearch/.test(c) ||
    (/\bmid\b/.test(c) && /\blow\b|\bhigh\b|\bleft\b|\bright\b/.test(c) && /while/.test(c))
  ) found.add("binary search");

  // Two-pointer
  if (
    (/left.*right|lo.*hi|start.*end/.test(c)) &&
    (/while\s*\(.*left.*right|while\s*\(.*lo.*hi/.test(c) || /two.?pointer/.test(c))
  ) found.add("two-pointer");

  // Sliding window
  if (/sliding.?window|window.?size/.test(c) ||
    (/\bwindow\b/.test(c) && /\bmax\b|\bmin\b/.test(c) && /\bfor\b/.test(c))) {
    found.add("sliding window");
  }

  // Dynamic programming / memoization
  if (/\bdp\b|\bmemo\b|memoiz|dynamic.?program|lru_cache|@cache/.test(c)) {
    found.add("dynamic programming");
  }

  // Greedy
  if (/\bgreedy\b/.test(c)) found.add("greedy");

  // BFS / DFS
  if (/\bbfs\b|\bdfs\b|breadth.?first|depth.?first/.test(c)) {
    found.add("graph traversal (BFS/DFS)");
  }

  // Divide and conquer
  if (/divide.?and.?conquer|merge.?sort/.test(c)) found.add("divide and conquer");

  // Backtracking
  if (/\bbacktrack/.test(c)) found.add("backtracking");

  // Bit manipulation
  if (/\bxor\b|<<|>>|\&\s*\d|bit.?mask/.test(c)) found.add("bit manipulation");

  return [...found];
}

/** Estimate Big-O complexity from structural features. */
function estimateComplexity(
  forCount: number,
  whileCount: number,
  maxNesting: number,
  recursion: boolean,
  algorithms: string[],
): string {
  const totalLoops = forCount + whileCount;

  if (algorithms.includes("dynamic programming")) return "O(n²) or O(n·m)";
  if (algorithms.includes("backtracking"))        return "O(2ⁿ) worst case";
  if (algorithms.includes("divide and conquer"))  return "O(n log n)";
  if (algorithms.includes("sorting"))             return "O(n log n)";
  if (algorithms.includes("binary search") && totalLoops <= 1) return "O(log n)";

  if (recursion) {
    if (totalLoops === 0) return "O(n) or O(2ⁿ) — depends on branching";
    return "O(n log n) or higher";
  }

  if (maxNesting >= 3) return "O(n³) or higher";
  if (maxNesting === 2 || (forCount >= 2 && whileCount >= 1)) return "O(n²)";
  if (totalLoops >= 2 && algorithms.includes("binary search")) return "O(n log n)";
  if (totalLoops === 1) return "O(n)";
  if (totalLoops === 0) return "O(1)";

  return "O(n)";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function analyzeCode(rawCode: string, language: string): CodeStructure {
  const code    = stripStringsAndComments(rawCode);
  const lang    = language.toLowerCase();

  // ── Loops ──────────────────────────────────────────────────────────────
  const forCount   = countMatches(code, /\bfor\b/g);
  const whileCount = countMatches(code, /\bwhile\b/g);
  const doWhile    = /\bdo\s*\{/.test(code) || /\bdo\b/.test(code);
  const maxNesting = estimateMaxLoopNesting(rawCode, language);

  // ── Conditionals ───────────────────────────────────────────────────────
  const ifCount     = countMatches(code, /\bif\b/g);
  const switchCount = countMatches(code, /\bswitch\b/g);
  const ternary     = /\?[^:]+:/.test(code);

  // ── Recursion ──────────────────────────────────────────────────────────
  const recursion = detectRecursion(rawCode, language);

  // ── Data structures & algorithms ───────────────────────────────────────
  const dataStructures = detectDataStructures(rawCode, language);
  const algorithmHints = detectAlgorithmPatterns(rawCode);

  // ── Complexity ─────────────────────────────────────────────────────────
  const complexity = estimateComplexity(forCount, whileCount, maxNesting, recursion, algorithmHints);

  // ── Narrative ──────────────────────────────────────────────────────────
  const parts: string[] = [];

  // Loop structure
  const loopDesc: string[] = [];
  if (forCount > 0)   loopDesc.push(`${forCount} for-loop${forCount > 1 ? "s" : ""}`);
  if (whileCount > 0) loopDesc.push(`${whileCount} while-loop${whileCount > 1 ? "s" : ""}`);
  if (doWhile)        loopDesc.push("a do-while loop");
  if (loopDesc.length > 0) {
    const nestNote = maxNesting >= 2 ? ` (nested ${maxNesting} levels deep)` : "";
    parts.push(`The solution uses ${loopDesc.join(" and ")}${nestNote}.`);
  } else if (recursion) {
    parts.push("The solution is iterative-free and relies entirely on recursion.");
  } else {
    parts.push("The solution uses no loops (constant-time or purely recursive).");
  }

  // Recursion
  if (recursion) parts.push("It includes recursive function calls.");

  // Data structures
  if (dataStructures.length > 0) {
    parts.push(`It uses the following data structures: ${dataStructures.join(", ")}.`);
  }

  // Algorithmic patterns
  if (algorithmHints.length > 0) {
    parts.push(`Recognisable algorithmic patterns: ${algorithmHints.join(", ")}.`);
  }

  // Complexity
  parts.push(`Estimated time complexity: ${complexity}.`);

  const narrative = parts.join(" ");

  return {
    loops:          { forCount, whileCount, doWhile, maxNesting },
    conditionals:   { ifCount, switchCount, ternary },
    recursion,
    dataStructures,
    algorithmHints,
    complexity,
    narrative,
  };
}
