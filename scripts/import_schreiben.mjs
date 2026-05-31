// Importiert alte Begehungs-Schreiben als Dokument je Parzelle (chronologisch).
// DOCX/DOC/DOCM -> PDF via LibreOffice (headless); vorhandene PDFs direkt.
// Parzelle aus Dateiname (K53, S59a…), Jahr aus Ordnername.
//
// Aufruf: node --env-file=.env scripts/import_schreiben.mjs "_quelldaten/alte_Schreiben/Daten_Sabine"
import { PrismaClient } from "@prisma/client";
import { readdir, readFile, mkdir, writeFile, stat, rm } from "node:fs/promises";
import { join, resolve, extname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

const prisma = new PrismaClient();
const STORAGE = resolve(process.env.STORAGE_DIR ?? "./storage");
const SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
const TMP = resolve("./.tmp_pdf");
const basis = process.argv[2];

// rekursiv alle relevanten Dateien sammeln
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function parzelleAus(name) {
  // erstes Vorkommen K/S + Nummer (+ Index), nicht innerhalb "KS"
  const m = name.match(/(?<![A-Za-z])([KS])\s*0*(\d{1,2})([a-z]?)(?![0-9])/);
  if (!m) return null;
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}${(m[3] || "").toLowerCase()}`;
}
function jahrAus(pfad) {
  const m = pfad.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : null;
}

const valid = new Set((await prisma.parzelle.findMany({ select: { parzelleId: true } })).map((p) => p.parzelleId));
await mkdir(TMP, { recursive: true });

const dateien = (await walk(basis)).filter((f) => /\.(docx?|docm|pdf)$/i.test(f) && !/~\$/.test(basename(f)));
let ok = 0, skip = 0;
const unbekannt = [];

for (const datei of dateien) {
  const name = basename(datei);
  const pid = parzelleAus(name);
  const jahr = jahrAus(datei) ?? jahrAus(name);
  if (!pid || !jahr) { skip++; continue; }
  if (!valid.has(pid)) { unbekannt.push(`${pid} (${name})`); continue; }
  const parz = await prisma.parzelle.findUnique({ where: { parzelleId: pid }, select: { id: true } });
  const notiz = name.replace(/\.(docx?|docm|pdf)$/i, "");
  // idempotent: gleiche Notiz schon vorhanden?
  if (await prisma.dokument.findFirst({ where: { parzelleId: parz.id, notiz } })) { skip++; continue; }

  let pdfBuf;
  try {
    if (/\.pdf$/i.test(datei)) {
      pdfBuf = await readFile(datei);
    } else {
      await exec(SOFFICE, ["--headless", "--convert-to", "pdf", "--outdir", TMP, datei], { timeout: 120000 });
      const pdfName = name.replace(/\.(docx?|docm)$/i, ".pdf");
      pdfBuf = await readFile(join(TMP, pdfName));
    }
  } catch (e) { console.error(`Konvertierung fehlgeschlagen ${name}: ${e.message}`); skip++; continue; }

  const relDir = join("dokumente", pid);
  await mkdir(join(STORAGE, relDir), { recursive: true });
  const rel = join(relDir, `${randomUUID()}.pdf`);
  await writeFile(join(STORAGE, rel), pdfBuf);
  await prisma.dokument.create({
    data: { parzelleId: parz.id, typ: "schreiben", dateipfad: rel, datum: new Date(jahr, 6, 1), notiz },
  });
  ok++;
  console.log(`✓ ${pid} ${jahr}: ${notiz}`);
}

await rm(TMP, { recursive: true, force: true });
console.log(`\nFertig: ${ok} Schreiben importiert, ${skip} übersprungen.`);
if (unbekannt.length) console.log("Unbekannte Parzellen:", unbekannt.join("; "));
await prisma.$disconnect();
