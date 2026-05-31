-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Foto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "befundId" INTEGER NOT NULL,
    "mangelId" INTEGER,
    "beetId" INTEGER,
    "kontext" TEXT NOT NULL DEFAULT 'mangel',
    "dateipfad" TEXT NOT NULL,
    "beschreibung" TEXT NOT NULL DEFAULT '',
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Foto_befundId_fkey" FOREIGN KEY ("befundId") REFERENCES "Befund" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Foto_mangelId_fkey" FOREIGN KEY ("mangelId") REFERENCES "Mangel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Foto_beetId_fkey" FOREIGN KEY ("beetId") REFERENCES "Beet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Foto" ("befundId", "beschreibung", "dateipfad", "erstelltAm", "id", "kontext", "mangelId") SELECT "befundId", "beschreibung", "dateipfad", "erstelltAm", "id", "kontext", "mangelId" FROM "Foto";
DROP TABLE "Foto";
ALTER TABLE "new_Foto" RENAME TO "Foto";
CREATE INDEX "Foto_befundId_idx" ON "Foto"("befundId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
