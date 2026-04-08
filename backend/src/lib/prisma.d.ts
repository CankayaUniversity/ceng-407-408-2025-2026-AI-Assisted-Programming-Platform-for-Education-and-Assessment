import type { PrismaClient } from "@prisma/client";
import type { Pool } from "pg";

/**
 * Prisma 7 + adapter: uygulama anında client tam; TS çıkarımı bazen delegeleri düşürüyor.
 * Bu bildirim IDE ve tsc için tam PrismaClient tipini sabitler.
 */
export declare const prisma: PrismaClient;
export declare const pgPool: Pool;
