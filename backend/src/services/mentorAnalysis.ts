import { analyzeCode } from "./codeAnalyzer";
import { normalizeText } from "./mentorContext";
import type {
  MentorControlledContextSource,
  MentorRequestInput,
  MentorRuntimeAnalysis,
  MentorStudentCodeAnalysis,
  MentorVisibleTestCaseResult,
} from "./mentorTypes";

function firstFailedVisibleCase(input: MentorRequestInput): {
  index: number;
  testCase: MentorVisibleTestCaseResult;
} | null {
  const cases = input.testResults?.visibleCases ?? [];
  const index = cases.findIndex((testCase) => testCase?.passed === false);
  return index >= 0 ? { index, testCase: cases[index] } : null;
}

function firstDifferenceIndex(expected: string, actual: string): number | null {
  const max = Math.max(expected.length, actual.length);
  for (let index = 0; index < max; index += 1) {
    if (expected[index] !== actual[index]) return index;
  }
  return null;
}

function buildOutputDiff(input: MentorRequestInput): MentorRuntimeAnalysis["outputDiff"] {
  const failed = firstFailedVisibleCase(input);
  if (!failed) return null;

  const expected = normalizeText(failed.testCase.expected);
  const actual = normalizeText(failed.testCase.actual);
  if (!expected && !actual) return null;

  return {
    caseIndex: failed.index + 1,
    input: failed.testCase.input ?? null,
    expectedPreview: expected.slice(0, 240),
    actualPreview: actual.slice(0, 240),
    firstDifferenceIndex: firstDifferenceIndex(expected, actual),
    whitespaceOnlyDifference: expected.replace(/\s+/g, "") === actual.replace(/\s+/g, ""),
    lengthDifference: actual.length - expected.length,
  };
}

function classifyRuntime(input: MentorRequestInput): MentorRuntimeAnalysis {
  const status = normalizeText(input.runStatus || input.testResults?.status).toLowerCase();
  const stderr = normalizeText(input.stderr || input.errorMessage);
  const stdout = normalizeText(input.stdout);
  const summary = normalizeText(input.testResults?.summary);
  const failed = firstFailedVisibleCase(input);
  const evidence: string[] = [];

  if (status) evidence.push(`runStatus=${status}`);
  if (stderr) evidence.push(`stderr=${stderr.slice(0, 160)}`);
  if (stdout) evidence.push(`stdout=${stdout.slice(0, 160)}`);
  if (summary) evidence.push(`testSummary=${summary.slice(0, 160)}`);
  if (failed) evidence.push(`visibleCase${failed.index + 1}=failed`);

  if (status === "idle") {
    return { kind: "idle", confidence: 0.95, evidence, outputDiff: null };
  }

  if (/compile|syntax|expected|undeclared|undefined reference|cannot find symbol/i.test(stderr) || status.includes("compile")) {
    return { kind: "compile_error", confidence: 0.85, evidence, outputDiff: null };
  }

  if (/traceback|exception|runtime|segmentation fault|segfault|indexerror|typeerror|valueerror|zerodivision/i.test(stderr) || status.includes("runtime")) {
    return { kind: "runtime_error", confidence: 0.85, evidence, outputDiff: null };
  }

  if (/timeout|time limit|killed/i.test(stderr) || status.includes("timeout")) {
    return { kind: "timeout", confidence: 0.8, evidence, outputDiff: null };
  }

  if (failed || status.includes("wrong") || status.includes("fail")) {
    return { kind: "wrong_answer", confidence: failed ? 0.85 : 0.7, evidence, outputDiff: buildOutputDiff(input) };
  }

  if (status.includes("accepted") || status.includes("pass")) {
    return { kind: "accepted", confidence: 0.75, evidence, outputDiff: null };
  }

  return { kind: "unknown", confidence: evidence.length > 0 ? 0.45 : 0.2, evidence, outputDiff: buildOutputDiff(input) };
}

function analyzeStudentCode(input: MentorRequestInput): MentorStudentCodeAnalysis | null {
  const code = normalizeText(input.studentCode);
  if (!code) return null;

  const language = normalizeText(input.language) || "unknown";
  const structure = analyzeCode(code, language);
  return {
    language,
    hasCode: true,
    loopCount: structure.loops.forCount + structure.loops.whileCount + (structure.loops.doWhile ? 1 : 0),
    conditionalCount: structure.conditionals.ifCount + structure.conditionals.switchCount + (structure.conditionals.ternary ? 1 : 0),
    recursion: structure.recursion,
    dataStructures: structure.dataStructures,
    algorithmHints: structure.algorithmHints,
    estimatedComplexity: structure.complexity,
    narrative: structure.narrative,
  };
}

function sourceKind(path: string): MentorControlledContextSource["kind"] {
  const lower = path.toLowerCase();
  if (/\brubric\b|değerlendirme|degerlendirme/.test(lower)) return "rubric";
  if (/\bassignment\b|\bproblem\b|ödev|odev/.test(lower)) return "assignment";
  if (/\blesson\b|\bcourse\b|\blecture\b|ders|materyal|material/.test(lower)) return "lesson";
  return "unknown";
}

function controlledSources(input: MentorRequestInput): MentorControlledContextSource[] | null {
  const sources = (input.relatedFiles ?? [])
    .map((file) => ({
      path: normalizeText(file.path),
      kind: sourceKind(normalizeText(file.path)),
    }))
    .filter((source) => source.path && source.kind !== "unknown")
    .slice(0, 6);

  return sources.length > 0 ? sources : null;
}

export function enrichMentorAnalysis(input: MentorRequestInput): MentorRequestInput {
  input.runtimeAnalysis = classifyRuntime(input);
  input.studentCodeAnalysis = analyzeStudentCode(input);
  input.controlledContextSources = controlledSources(input);
  return input;
}
