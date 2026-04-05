type AttemptLike = {
  createdAt: Date;
  statusCategory: string | null;
  passedPublicCount: number;
  totalPublicCount: number;
  passedHiddenCount: number;
  totalHiddenCount: number;
};

type HintLike = {
  sequence: number;
  createdAt: Date;
};

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(4));
}

function countByCategory(attempts: AttemptLike[]) {
  const counts: Record<string, number> = {};
  for (const attempt of attempts) {
    const key = attempt.statusCategory ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function buildStudentProblemMetrics(attempts: AttemptLike[], hints: HintLike[]) {
  const orderedAttempts = [...attempts].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const firstAttempt = orderedAttempts[0] ?? null;
  const latestAttempt = orderedAttempts[orderedAttempts.length - 1] ?? null;
  const firstAccepted =
    orderedAttempts.find((attempt) => attempt.statusCategory === "accepted") ?? null;

  const totalPublicPassed = orderedAttempts.reduce(
    (sum, attempt) => sum + attempt.passedPublicCount,
    0,
  );
  const totalPublic = orderedAttempts.reduce(
    (sum, attempt) => sum + attempt.totalPublicCount,
    0,
  );
  const totalHiddenPassed = orderedAttempts.reduce(
    (sum, attempt) => sum + attempt.passedHiddenCount,
    0,
  );
  const totalHidden = orderedAttempts.reduce(
    (sum, attempt) => sum + attempt.totalHiddenCount,
    0,
  );

  const publicImprovement =
    latestAttempt && firstAttempt
      ? latestAttempt.passedPublicCount - firstAttempt.passedPublicCount
      : 0;
  const hiddenImprovement =
    latestAttempt && firstAttempt
      ? latestAttempt.passedHiddenCount - firstAttempt.passedHiddenCount
      : 0;

  return {
    attemptsCount: orderedAttempts.length,
    solutionSuccess: {
      publicPassRate: safeRatio(totalPublicPassed, totalPublic),
      hiddenPassRate: safeRatio(totalHiddenPassed, totalHidden),
      acceptedAttempts: orderedAttempts.filter((attempt) => attempt.statusCategory === "accepted")
        .length,
      latestStatus: latestAttempt?.statusCategory ?? null,
    },
    processQuality: {
      timeToFirstAcceptedMs:
        firstAttempt && firstAccepted
          ? firstAccepted.createdAt.getTime() - firstAttempt.createdAt.getTime()
          : null,
      publicImprovement,
      hiddenImprovement,
    },
    errorProfile: countByCategory(orderedAttempts),
    hintDependency: {
      totalHints: hints.length,
      latestHintSequence:
        hints.length > 0
          ? Math.max(...hints.map((hint) => hint.sequence))
          : 0,
      hintToAttemptRatio: safeRatio(hints.length, Math.max(orderedAttempts.length, 1)),
    },
    codeQuality: {
      available: false,
      score: null,
    },
    learningTrend: {
      direction:
        publicImprovement > 0 || hiddenImprovement > 0
          ? "improving"
          : publicImprovement < 0 || hiddenImprovement < 0
            ? "declining"
            : "stable",
    },
  };
}
