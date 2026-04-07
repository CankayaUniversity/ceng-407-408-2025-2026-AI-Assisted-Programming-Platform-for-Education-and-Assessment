import type { Prisma } from "@prisma/client";

/**
 * Prisma 7 + driver adapter: bazı TS sürümlerinde PrismaClient örneğinde model delegeleri çıkarılmıyor.
 * Arayüz birleştirmesi IDE ve derleyicide eksik alanları tamamlar (çalışma anı zaten doğru).
 */
declare module "@prisma/client" {
  interface PrismaClient {
    submissionAttempt: Prisma.SubmissionAttemptDelegate<any, any>;
    hintEvent: Prisma.HintEventDelegate<any, any>;
    aiInteractionAudit: Prisma.AiInteractionAuditDelegate<any, any>;
  }
}
