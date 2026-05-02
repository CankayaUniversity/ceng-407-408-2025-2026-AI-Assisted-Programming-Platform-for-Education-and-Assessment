-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending_email', 'pending_approval', 'active', 'suspended');

-- AlterTable: add columns missing from earlier migrations
-- status: user verification/approval state — existing rows default to 'active'
ALTER TABLE "User" ADD COLUMN "status"    "UserStatus" NOT NULL DEFAULT 'active';
-- isAdmin: superuser flag — existing rows default to false
ALTER TABLE "User" ADD COLUMN "isAdmin"   BOOLEAN NOT NULL DEFAULT false;
-- classYear: year of study for students (nullable)
ALTER TABLE "User" ADD COLUMN "classYear" INTEGER;
