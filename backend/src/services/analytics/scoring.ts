type AttemptLike = {
  createdAt: Date;
  normalizedStatus: string;
  problemId?: number | null;
};

type HintLike = {
  sequence: number;
  createdAt: Date;
};

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function countByCategory(attempts: AttemptLike[]) {
  const counts: Record<string, number> = {};
  for (const attempt of attempts) {
    const key = attempt.normalizedStatus ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Compare acceptance rate in the first half of attempts vs the second half.
 * Requires at least 4 attempts to produce a meaningful signal — anything
 * fewer is reported as "stable" (insufficient data).
 */
function computeLearningTrend(
  attempts: AttemptLike[],
): "improving" | "declining" | "stable" {
  if (attempts.length < 4) return "stable";

  const mid = Math.floor(attempts.length / 2);
  const firstHalf  = attempts.slice(0, mid);
  const secondHalf = attempts.slice(mid);

  const rate = (arr: AttemptLike[]) =>
    arr.filter((a) => a.normalizedStatus === "accepted").length / arr.length;

  const first  = rate(firstHalf);
  const second = rate(secondHalf);

  // Require a meaningful gap (>5 pp) to avoid noise
  if (second > first + 0.05) return "improving";
  if (second < first - 0.05) return "declining";
  return "stable";
}

export function buildStudentProblemMetrics(attempts: AttemptLike[], hints: HintLike[]) {
  const orderedAttempts = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const firstAttempt  = orderedAttempts[0] ?? null;
  const latestAttempt = orderedAttempts[orderedAttempts.length - 1] ?? null;

  const acceptedAttempts = orderedAttempts.filter(
    (a) => a.normalizedStatus === "accepted",
  );
  const firstAccepted = acceptedAttempts[0] ?? null;

  // Distinct problems where the student has at least one accepted attempt
  const distinctSolvedIds = new Set(
    acceptedAttempts
      .filter((a) => a.problemId != null)
      .map((a) => a.problemId),
  );

  return {
    attemptsCount: orderedAttempts.length,

    solutionSuccess: {
      /** Percentage of total attempts that were accepted  (0–1 ratio) */
      successRate: safeRatio(acceptedAttempts.length, orderedAttempts.length),
      acceptedAttempts: acceptedAttempts.length,
      distinctProblemsSolved: distinctSolvedIds.size,
      latestStatus: latestAttempt?.normalizedStatus ?? null,
    },

    processQuality: {
      /** How long (ms) between the very first attempt and the first accepted one */
      timeToFirstAcceptedMs:
        firstAttempt && firstAccepted
          ? firstAccepted.createdAt.getTime() - firstAttempt.createdAt.getTime()
          : null,
    },

    errorProfile: countByCategory(orderedAttempts),

    hintDependency: {
      totalHints: hints.length,
      hintToAttemptRatio: safeRatio(hints.length, Math.max(orderedAttempts.length, 1)),
    },

    codeQuality: {
      available: false,
      score: null,
    },

    learningTrend: {
      direction: computeLearningTrend(orderedAttempts),
    },
  };
}
