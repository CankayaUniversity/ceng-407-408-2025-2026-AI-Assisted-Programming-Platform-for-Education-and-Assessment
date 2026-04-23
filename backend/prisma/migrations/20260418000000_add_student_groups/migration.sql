CREATE TABLE "StudentGroup" (
  "id"          SERIAL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "createdById" INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StudentGroupMembership" (
  "id"      SERIAL PRIMARY KEY,
  "groupId" INTEGER NOT NULL,
  "userId"  INTEGER NOT NULL,
  CONSTRAINT "StudentGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentGroupMembership_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id")         ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentGroupMembership_groupId_userId_key" ON "StudentGroupMembership"("groupId", "userId");
CREATE INDEX "StudentGroup_createdById_idx"           ON "StudentGroup"("createdById");
CREATE INDEX "StudentGroupMembership_userId_idx"      ON "StudentGroupMembership"("userId");
