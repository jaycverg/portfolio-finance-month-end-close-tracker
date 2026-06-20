import { PrismaClient } from "@prisma/client";

// Prisma singleton guarded on globalThis so Next.js dev HMR doesn't spawn a new
// client (and a new connection pool) on every hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
