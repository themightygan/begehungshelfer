-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Begehungsrunde" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "anlageId" INTEGER NOT NULL,
    "datum" DATETIME NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "art" TEXT NOT NULL DEFAULT 'begehung',
    "teilnehmende" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'offen',
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Begehungsrunde_anlageId_fkey" FOREIGN KEY ("anlageId") REFERENCES "Anlage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Begehungsrunde" ("anlageId", "bezeichnung", "datum", "erstelltAm", "id", "status", "teilnehmende") SELECT "anlageId", "bezeichnung", "datum", "erstelltAm", "id", "status", "teilnehmende" FROM "Begehungsrunde";
DROP TABLE "Begehungsrunde";
ALTER TABLE "new_Begehungsrunde" RENAME TO "Begehungsrunde";
CREATE INDEX "Begehungsrunde_anlageId_datum_idx" ON "Begehungsrunde"("anlageId", "datum");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
