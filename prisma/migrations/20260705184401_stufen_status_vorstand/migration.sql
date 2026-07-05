-- CreateTable
CREATE TABLE "Vorstand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwortHash" TEXT,
    "passwortSalt" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "sortierung" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Befund" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rundeId" INTEGER NOT NULL,
    "parzelleId" INTEGER NOT NULL,
    "stufe" TEXT NOT NULL DEFAULT 'neutral',
    "status" TEXT NOT NULL DEFAULT 'offen',
    "notiz" TEXT NOT NULL DEFAULT '',
    "diktatNachgereicht" TEXT NOT NULL DEFAULT '',
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
INSERT INTO "new_Befund" ("diktatNachgereicht", "gutGemacht", "id", "kompBeerenAnzahl", "kompBeerenFlaecheM2", "kompObstAnzahl", "kompObstFlaecheM2", "kompensationAusreichend", "kompensationFaktoren", "kompensationNotiz", "notiz", "parzelleId", "plakettenNotiz", "rundeId", "snapAdresse", "snapPaechter", "snapParzelleId", "stufe", "zeitpunkt") SELECT "diktatNachgereicht", "gutGemacht", "id", "kompBeerenAnzahl", "kompBeerenFlaecheM2", "kompObstAnzahl", "kompObstFlaecheM2", "kompensationAusreichend", "kompensationFaktoren", "kompensationNotiz", "notiz", "parzelleId", "plakettenNotiz", "rundeId", "snapAdresse", "snapPaechter", "snapParzelleId", "stufe", "zeitpunkt" FROM "Befund";
DROP TABLE "Befund";
ALTER TABLE "new_Befund" RENAME TO "Befund";
CREATE INDEX "Befund_parzelleId_idx" ON "Befund"("parzelleId");
CREATE UNIQUE INDEX "Befund_rundeId_parzelleId_key" ON "Befund"("rundeId", "parzelleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Vorstand_name_key" ON "Vorstand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vorstand_email_key" ON "Vorstand"("email");

-- Daten-Migration: Eskalationsstufe "hinweis" heißt jetzt "mitteilung"
UPDATE "Befund" SET "stufe" = 'mitteilung' WHERE "stufe" = 'hinweis';

-- Daten-Fix historische Runden: "Günter Lorenz" war ein Falscheintrag für
-- Tomasz Weidler (Personenkorrektur); Jörissen/Jörressen sind Schreibfehler
-- für Jörreßen.
UPDATE "Begehungsrunde" SET "teilnehmende" = REPLACE("teilnehmende", 'Günter Lorenz', 'Tomasz Weidler');
UPDATE "Begehungsrunde" SET "teilnehmende" = REPLACE("teilnehmende", 'Adrian Jörissen', 'Adrian Jörreßen');
UPDATE "Begehungsrunde" SET "teilnehmende" = REPLACE("teilnehmende", 'Adrian Jörressen', 'Adrian Jörreßen');

-- Seed: Vorstand (Reihenfolge = Vereinsnummerierung) — in der Migration statt
-- seed.mjs, damit er garantiert auch auf der Prod-DB läuft.
INSERT INTO "Vorstand" ("name", "sortierung") VALUES
  ('Sabine Metzger', 1),
  ('Dr. Sascha Theißen', 2),
  ('Sonja Theißen', 3),
  ('Nicole Boine', 4),
  ('Erika Strack', 5),
  ('Adrian Jörreßen', 6),
  ('Sadullah Ödes', 7),
  ('Tomasz Weidler', 8),
  ('Dr. Ralf Riekers', 9);
