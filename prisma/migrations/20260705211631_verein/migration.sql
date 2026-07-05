-- CreateTable
CREATE TABLE "Verein" (
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
    "bezirksverbandEmail" TEXT NOT NULL DEFAULT ''
);
