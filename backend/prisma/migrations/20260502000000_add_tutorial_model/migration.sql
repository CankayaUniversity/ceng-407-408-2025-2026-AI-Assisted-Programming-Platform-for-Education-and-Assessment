-- CreateTable
CREATE TABLE "Tutorial" (
    "id"        SERIAL NOT NULL,
    "tag"       TEXT NOT NULL,
    "language"  TEXT NOT NULL,
    "content"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tutorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tutorial_tag_language_idx" ON "Tutorial"("tag", "language");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Tutorial_tag_language_key" ON "Tutorial"("tag", "language");
