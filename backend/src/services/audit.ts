import type { Prisma, PolicyAction } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function createAiInteractionAudit(params: {
  userId: number;
  problemId: number;
  attemptId?: number | null;
  mentorModel: string;
  validatorModel?: string | null;
  mentorRaw: string;
  validatorJson?: unknown;
  policyAction: PolicyAction;
  finalText: string;
  rewriteCount?: number;
  latencyMsMentor?: number | null;
  latencyMsValidator?: number | null;
  errorCode?: string | null;
}) {
  return prisma.aIInteractionAudit.create({
    data: {
      userId: params.userId,
      problemId: params.problemId,
      attemptId: params.attemptId ?? null,
      mentorModel: params.mentorModel,
      validatorModel: params.validatorModel ?? null,
      mentorRaw: params.mentorRaw,
      validatorJson:
        params.validatorJson === undefined || params.validatorJson === null
          ? undefined
          : (params.validatorJson as Prisma.InputJsonValue),
      policyAction: params.policyAction,
      finalText: params.finalText,
      rewriteCount: params.rewriteCount ?? 0,
      latencyMsMentor: params.latencyMsMentor ?? null,
      latencyMsValidator: params.latencyMsValidator ?? null,
      errorCode: params.errorCode ?? null,
    },
  });
}
