import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createClient(): { prisma: PrismaClient; pool: Pool } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
  const prisma = new PrismaClient({ adapter }) as unknown as PrismaClient;
  return { prisma, pool };
}

const cached =
  globalForPrisma.prisma && globalForPrisma.pool
    ? { prisma: globalForPrisma.prisma, pool: globalForPrisma.pool }
    : createClient();

export const prisma = cached.prisma;
export const pgPool = cached.pool;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pgPool;
}
