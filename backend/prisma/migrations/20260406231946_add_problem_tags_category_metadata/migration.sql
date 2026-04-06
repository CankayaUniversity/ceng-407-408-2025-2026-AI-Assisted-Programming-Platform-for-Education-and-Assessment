-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "category" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
