-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Parzelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parzelleId" TEXT NOT NULL,
    "anlageId" INTEGER NOT NULL,
    "nummer" INTEGER NOT NULL,
    "index" TEXT NOT NULL DEFAULT '',
    "nachname" TEXT NOT NULL DEFAULT '',
    "vorname" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "telefon" TEXT NOT NULL DEFAULT '',
    "strasse" TEXT NOT NULL DEFAULT '',
    "plz" TEXT NOT NULL DEFAULT '',
    "ort" TEXT NOT NULL DEFAULT '',
    "eintritt" TEXT NOT NULL DEFAULT '',
    "anrede" TEXT NOT NULL DEFAULT '',
    "anredeStil" TEXT NOT NULL DEFAULT 'sie',
    "groesseM2" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'verpachtet',
    CONSTRAINT "Parzelle_anlageId_fkey" FOREIGN KEY ("anlageId") REFERENCES "Anlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Parzelle" ("anlageId", "eintritt", "email", "groesseM2", "id", "index", "nachname", "nummer", "ort", "parzelleId", "plz", "status", "strasse", "telefon", "vorname") SELECT "anlageId", "eintritt", "email", "groesseM2", "id", "index", "nachname", "nummer", "ort", "parzelleId", "plz", "status", "strasse", "telefon", "vorname" FROM "Parzelle";
DROP TABLE "Parzelle";
ALTER TABLE "new_Parzelle" RENAME TO "Parzelle";
CREATE UNIQUE INDEX "Parzelle_parzelleId_key" ON "Parzelle"("parzelleId");
CREATE INDEX "Parzelle_anlageId_idx" ON "Parzelle"("anlageId");
CREATE TABLE "new_Verein" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT '',
    "vorsitzender" TEXT NOT NULL DEFAULT '',
    "adresse" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "emailBenutzer" TEXT NOT NULL DEFAULT '',
    "emailPasswort" TEXT NOT NULL DEFAULT '',
    "imapServer" TEXT NOT NULL DEFAULT '',
    "smtpServer" TEXT NOT NULL DEFAULT '',
    "logoPfad" TEXT,
    "bezirksverbandEmail" TEXT NOT NULL DEFAULT '',
    "telefon" TEXT NOT NULL DEFAULT '',
    "ort" TEXT NOT NULL DEFAULT '',
    "bvName" TEXT NOT NULL DEFAULT '',
    "bvStrasse" TEXT NOT NULL DEFAULT '',
    "bvPlzOrt" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_Verein" ("adresse", "bezirksverbandEmail", "email", "emailBenutzer", "emailPasswort", "id", "imapServer", "logoPfad", "name", "smtpServer", "vorsitzender") SELECT "adresse", "bezirksverbandEmail", "email", "emailBenutzer", "emailPasswort", "id", "imapServer", "logoPfad", "name", "smtpServer", "vorsitzender" FROM "Verein";
DROP TABLE "Verein";
ALTER TABLE "new_Verein" RENAME TO "Verein";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
