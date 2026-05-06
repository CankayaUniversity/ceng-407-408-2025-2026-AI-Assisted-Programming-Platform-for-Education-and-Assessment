-- Add missing 'rejected' value to UserStatus enum
-- (pending_email / pending_approval / active / suspended were added in 20260504;
--  rejected was in schema.prisma but omitted from that migration)
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'rejected';

-- CreateTable: VerificationCode
-- One-time email OTP codes (6-digit, 15-minute expiry) for the two-step
-- registration flow (email verify → account activation).

CREATE TABLE "VerificationCode" (
    "id"        SERIAL       NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "code"      TEXT         NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used"      BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationCode_userId_idx" ON "VerificationCode"("userId");

-- AddForeignKey
ALTER TABLE "VerificationCode"
    ADD CONSTRAINT "VerificationCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
