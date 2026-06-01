-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Befund" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rundeId" INTEGER NOT NULL,
    "parzelleId" INTEGER NOT NULL,
    "stufe" TEXT NOT NULL DEFAULT 'neutral',
    "notiz" TEXT NOT NULL DEFAULT '',
    "zeitpunkt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapParzelleId" TEXT NOT NULL,
    "snapPaechter" TEXT NOT NULL DEFAULT '',
    "snapAdresse" TEXT NOT NULL DEFAULT '',
    "gutGemacht" BOOLEAN NOT NULL DEFAULT false,
    "plakettenNotiz" TEXT NOT NULL DEFAULT '',
    "kompensationFaktoren" TEXT NOT NULL DEFAULT '',
    "kompObstAnzahl" INTEGER NOT NULL DEFAULT 0,
    "kompObstFlaecheM2" REAL NOT NULL DEFAULT 0,
    "kompBeerenAnzahl" INTEGER NOT NULL DEFAULT 0,
    "kompBeerenFlaecheM2" REAL NOT NULL DEFAULT 0,
    "kompensationNotiz" TEXT NOT NULL DEFAULT '',
    "kompensationAusreichend" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Befund_rundeId_fkey" FOREIGN KEY ("rundeId") REFERENCES "Begehungsrunde" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Befund_parzelleId_fkey" FOREIGN KEY ("parzelleId") REFERENCES "Parzelle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Befund" ("gutGemacht", "id", "kompensationAusreichend", "kompensationFaktoren", "kompensationNotiz", "notiz", "parzelleId", "plakettenNotiz", "rundeId", "snapAdresse", "snapPaechter", "snapParzelleId", "stufe", "zeitpunkt") SELECT "gutGemacht", "id", "kompensationAusreichend", "kompensationFaktoren", "kompensationNotiz", "notiz", "parzelleId", "plakettenNotiz", "rundeId", "snapAdresse", "snapPaechter", "snapParzelleId", "stufe", "zeitpunkt" FROM "Befund";
DROP TABLE "Befund";
ALTER TABLE "new_Befund" RENAME TO "Befund";
CREATE INDEX "Befund_parzelleId_idx" ON "Befund"("parzelleId");
CREATE UNIQUE INDEX "Befund_rundeId_parzelleId_key" ON "Befund"("rundeId", "parzelleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
