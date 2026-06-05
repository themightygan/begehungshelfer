// Importiert Wertermittlungen/Beanstandungen als Dokument (typ wertermittlung)
// je Parzelle mit dem im Dokument genannten Datum ("Tag der Wertermittlung").
// Idempotent über die Notiz. Aufruf: node --env-file=.env scripts/import_wertermittlungen.mjs
import { PrismaClient } from "@prisma/client";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const STORAGE = resolve(process.env.STORAGE_DIR ?? "./storage");
const DL = "/Users/macmini/Downloads";

const items = [
  { file: "Beanstandungen WE  K02 Kolso Endstand 2026 Stand 9.05.26.pdf", pid: "K2", datum: "2026-05-10", notiz: "Beanstandungen/Wertermittlung Endstand 2026 (Stand 10.05.26)" },
  { file: "K02 Kolso Endstand 2025.pdf", pid: "K2", datum: "2025-11-01", notiz: "Wertermittlung 2025 (Endstand)" },
  { file: "S62 Zeller_2025 Endstand.pdf", pid: "S62", datum: "2025-10-26", notiz: "Wertermittlung 2025 (Endstand)" },
  { file: "S61 Roth 2025 Endstand.pdf", pid: "S61", datum: "2025-10-26", notiz: "Wertermittlung 2025 (Endstand)" },
  { file: "K45 Maurer 2022 Endstand.pdf", pid: "K45", datum: "2022-10-14", notiz: "Wertermittlung 2022 (Endstand)" },
  { file: "K37 Ramminger 2023 Endstand.pdf", pid: "K37", datum: "2023-10-21", notiz: "Wertermittlung 2023 (Endstand)" },
  { file: "K49 Beanstandungen_Wertermittlung.jpg", pid: "K49", datum: "2025-10-26", notiz: "Wertermittlung 2025 (Beanstandungen; Datum geschätzt)" },
];

let ok = 0, skip = 0;
for (const it of items) {
  const parz = await prisma.parzelle.findUnique({ where: { parzelleId: it.pid }, select: { id: true } });
  if (!parz) { console.log(`❌ Parzelle ${it.pid} unbekannt`); continue; }
  if (await prisma.dokument.findFirst({ where: { parzelleId: parz.id, notiz: it.notiz, typ: "wertermittlung" } })) {
    console.log(`· übersprungen (vorhanden): ${it.pid} – ${it.notiz}`); skip++; continue;
  }
  let buf;
  try { buf = await readFile(join(DL, it.file)); }
  catch { console.log(`❌ Datei fehlt: ${it.file}`); continue; }
  const ext = it.file.split(".").pop().toLowerCase();
  const relDir = join("dokumente", it.pid);
  await mkdir(join(STORAGE, relDir), { recursive: true });
  const rel = join(relDir, `${randomUUID()}.${ext}`);
  await writeFile(join(STORAGE, rel), buf);
  await prisma.dokument.create({
    data: { parzelleId: parz.id, typ: "wertermittlung", dateipfad: rel, datum: new Date(it.datum), notiz: it.notiz },
  });
  console.log(`✓ ${it.pid} ${it.datum}: ${it.notiz}`);
  ok++;
}
console.log(`\nFertig: ${ok} importiert, ${skip} übersprungen.`);
await prisma.$disconnect();
