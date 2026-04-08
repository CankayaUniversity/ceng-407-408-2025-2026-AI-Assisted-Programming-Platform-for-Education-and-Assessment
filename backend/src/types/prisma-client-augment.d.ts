import type { Prisma } from "@prisma/client";

/**
 * Prisma 7 + driver adapter: model delegates may not be inferred in some TS versions.
 * Module augmentation fills in the missing accessors for IDE and compiler.
 */
declare module "@prisma/client" {
  interface PrismaClient {
    submissionAttempt: Prisma.SubmissionAttemptDelegate<any, any>;
    hintEvent: Prisma.HintEventDelegate<any, any>;
    aIInteractionAudit: Prisma.AIInteractionAuditDelegate<any, any>;
  }
}
