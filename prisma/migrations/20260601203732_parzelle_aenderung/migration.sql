-- CreateTable
CREATE TABLE "ParzelleAenderung" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parzelleId" INTEGER NOT NULL,
    "datum" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "art" TEXT NOT NULL DEFAULT 'sonstiges',
    "notiz" TEXT NOT NULL DEFAULT '',
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParzelleAenderung_parzelleId_fkey" FOREIGN KEY ("parzelleId") REFERENCES "Parzelle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ParzelleAenderung_parzelleId_datum_idx" ON "ParzelleAenderung"("parzelleId", "datum");
