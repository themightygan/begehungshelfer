-- CreateTable
CREATE TABLE "ArchivFoto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parzelleId" INTEGER NOT NULL,
    "datum" DATETIME NOT NULL,
    "quelle" TEXT NOT NULL DEFAULT '',
    "dateipfad" TEXT NOT NULL,
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivFoto_parzelleId_fkey" FOREIGN KEY ("parzelleId") REFERENCES "Parzelle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ArchivFoto_parzelleId_datum_idx" ON "ArchivFoto"("parzelleId", "datum");
