-- CreateTable
CREATE TABLE "Anlage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kuerzel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planBild" TEXT
);

-- CreateTable
CREATE TABLE "Parzelle" (
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
    "groesseM2" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'verpachtet',
    CONSTRAINT "Parzelle_anlageId_fkey" FOREIGN KEY ("anlageId") REFERENCES "Anlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Begehungsrunde" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "anlageId" INTEGER NOT NULL,
    "datum" DATETIME NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "teilnehmende" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'offen',
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Begehungsrunde_anlageId_fkey" FOREIGN KEY ("anlageId") REFERENCES "Anlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Befund" (
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
    CONSTRAINT "Befund_rundeId_fkey" FOREIGN KEY ("rundeId") REFERENCES "Begehungsrunde" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Befund_parzelleId_fkey" FOREIGN KEY ("parzelleId") REFERENCES "Parzelle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Beet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "befundId" INTEGER NOT NULL,
    "bezeichnung" TEXT NOT NULL DEFAULT '',
    "flaecheM2" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Beet_befundId_fkey" FOREIGN KEY ("befundId") REFERENCES "Befund" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mangel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "befundId" INTEGER NOT NULL,
    "katalogId" INTEGER,
    "bereich" TEXT NOT NULL,
    "punkt" TEXT NOT NULL,
    "notiz" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'offen',
    "frist" DATETIME,
    "behobenAm" DATETIME,
    CONSTRAINT "Mangel_befundId_fkey" FOREIGN KEY ("befundId") REFERENCES "Befund" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Mangel_katalogId_fkey" FOREIGN KEY ("katalogId") REFERENCES "Katalog" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "befundId" INTEGER NOT NULL,
    "mangelId" INTEGER,
    "kontext" TEXT NOT NULL DEFAULT 'mangel',
    "dateipfad" TEXT NOT NULL,
    "beschreibung" TEXT NOT NULL DEFAULT '',
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Foto_befundId_fkey" FOREIGN KEY ("befundId") REFERENCES "Befund" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Foto_mangelId_fkey" FOREIGN KEY ("mangelId") REFERENCES "Mangel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dokument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parzelleId" INTEGER NOT NULL,
    "typ" TEXT NOT NULL DEFAULT 'sonstiges',
    "dateipfad" TEXT NOT NULL,
    "datum" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notiz" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Dokument_parzelleId_fkey" FOREIGN KEY ("parzelleId") REFERENCES "Parzelle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Katalog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bereich" TEXT NOT NULL,
    "punkt" TEXT NOT NULL,
    "hinweis" TEXT NOT NULL DEFAULT '',
    "referenz" TEXT NOT NULL DEFAULT '',
    "sortierung" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "Anlage_kuerzel_key" ON "Anlage"("kuerzel");

-- CreateIndex
CREATE UNIQUE INDEX "Parzelle_parzelleId_key" ON "Parzelle"("parzelleId");

-- CreateIndex
CREATE INDEX "Parzelle_anlageId_idx" ON "Parzelle"("anlageId");

-- CreateIndex
CREATE INDEX "Begehungsrunde_anlageId_datum_idx" ON "Begehungsrunde"("anlageId", "datum");

-- CreateIndex
CREATE INDEX "Befund_parzelleId_idx" ON "Befund"("parzelleId");

-- CreateIndex
CREATE UNIQUE INDEX "Befund_rundeId_parzelleId_key" ON "Befund"("rundeId", "parzelleId");

-- CreateIndex
CREATE INDEX "Mangel_befundId_idx" ON "Mangel"("befundId");

-- CreateIndex
CREATE INDEX "Mangel_status_idx" ON "Mangel"("status");

-- CreateIndex
CREATE INDEX "Foto_befundId_idx" ON "Foto"("befundId");

-- CreateIndex
CREATE INDEX "Dokument_parzelleId_idx" ON "Dokument"("parzelleId");
