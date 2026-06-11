-- AlterTable
ALTER TABLE "Beet" ADD COLUMN "uid" TEXT;

-- AlterTable
ALTER TABLE "Mangel" ADD COLUMN "uid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Beet_uid_key" ON "Beet"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Mangel_uid_key" ON "Mangel"("uid");


-- Backfill: Altzeilen bekommen eine UUID (v4-Format via randomblob), damit der
-- Offline-Sync ALLE Mängel/Beete einheitlich über uid referenzieren kann.
UPDATE "Mangel" SET "uid" = lower(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' ||
  substr('89ab', (abs(random()) % 4) + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))
) WHERE "uid" IS NULL;
UPDATE "Beet" SET "uid" = lower(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' ||
  substr('89ab', (abs(random()) % 4) + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))
) WHERE "uid" IS NULL;
