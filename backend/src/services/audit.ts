import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function createAiInteractionAudit(params: {
  userId: number;
  problemId?: number | null;
  submissionId?: number | null;
  attemptId?: number | null;
  aiLogId?: number | null;
  mentorRaw?: string | null;
  validatorJson?: unknown;
  policyAction: string;
  finalText: string;
  mentorModel?: string | null;
  validatorModel?: string | null;
  durationMs?: number | null;
}) {
  return prisma.aiInteractionAudit.create({
    data: {
      userId: params.userId,
      problemId: params.problemId ?? null,
      submissionId: params.submissionId ?? null,
      attemptId: params.attemptId ?? null,
      aiLogId: params.aiLogId ?? null,
      mentorRaw: params.mentorRaw ?? null,
      validatorJson:
        params.validatorJson === undefined || params.validatorJson === null
          ? undefined
          : (params.validatorJson as Prisma.InputJsonValue),
      policyAction: params.policyAction,
      finalText: params.finalText,
      mentorModel: params.mentorModel ?? null,
      validatorModel: params.validatorModel ?? null,
      durationMs: params.durationMs ?? null,
    },
  });
}
