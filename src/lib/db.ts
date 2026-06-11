// Prisma-Singleton — verhindert verbrauchte Connections beim Hot-Reload (Next dev).
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaInit?: boolean;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite-Härtung für mehrere gleichzeitige Nutzer (Begehung zu zweit/dritt):
// WAL = Leser blockieren Schreiber nicht (persistiert in der DB-Datei, hier
// selbstheilend nach Restore); busy_timeout statt sofortigem SQLITE_BUSY.
// Zusätzlich: connection_limit=1 in DATABASE_URL serialisiert Schreibzugriffe.
if (!globalForPrisma.prismaInit) {
  globalForPrisma.prismaInit = true;
  // $queryRaw, nicht $executeRaw: PRAGMA liefert Ergebniszeilen, die
  // $executeRaw in SQLite ablehnt (der Aufruf würde sonst still scheitern).
  prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
}
