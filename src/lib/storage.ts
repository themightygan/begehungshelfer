// Datei-Speicher + Foto-Pipeline.
// Audit-Pflicht beim Upload: resize ~1600px + JPEG q75 + EXIF/Geo-Strip (DSGVO).
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
// @ts-expect-error -- heic-convert bringt keine Typen mit
import heicConvert from "heic-convert";
import { FOTO_MAX_KANTE, FOTO_JPEG_QUALITAET } from "./constants";

// STORAGE_DIR aus .env, relativ zum Projekt-Root aufgelöst.
export const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? "./storage");

// iPhone-Fotos sind HEIC/HEIF — sharp/libvips kann sie nicht dekodieren.
// Erkennung über die ISO-BMFF "ftyp"-Box-Marke (Bytes 4..12).
function istHeic(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const marke = buf.toString("ascii", 8, 12).toLowerCase();
  return ["heic", "heix", "heif", "hevc", "mif1", "msf1"].includes(marke);
}

// Verarbeitet ein Rohbild und legt es als JPEG unter storage/fotos/<befundId>/ ab.
// HEIC -> erst nach JPEG konvertieren. sharp ohne .withMetadata() => EXIF/GPS
// werden verworfen (Geo-Strip). Gibt den DB-Pfad zurück (relativ zu STORAGE_DIR).
export async function fotoVerarbeitenUndSpeichern(
  befundId: number,
  rohdaten: Buffer
): Promise<string> {
  const relDir = join("fotos", String(befundId));
  const absDir = join(STORAGE_DIR, relDir);
  await mkdir(absDir, { recursive: true });

  const dateiname = `${randomUUID()}.jpg`;
  const absPfad = join(absDir, dateiname);

  let eingabe = rohdaten;
  if (istHeic(rohdaten)) {
    const jpeg = await heicConvert({ buffer: rohdaten, format: "JPEG", quality: 0.92 });
    eingabe = Buffer.from(jpeg);
  }

  await sharp(eingabe)
    .rotate() // EXIF-Orientierung anwenden, BEVOR Metadaten verworfen werden
    .resize(FOTO_MAX_KANTE, FOTO_MAX_KANTE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: FOTO_JPEG_QUALITAET, mozjpeg: true })
    .toFile(absPfad);

  return join(relDir, dateiname); // z. B. "fotos/12/uuid.jpg"
}

// Akte-Dokument (PDF/Bild/…) unverändert ablegen unter dokumente/<parzelleId>/.
// Keine Bildverarbeitung — Schreiben/Wertermittlungen bleiben original.
export async function dokumentSpeichern(
  parzelleId: string,
  daten: Buffer,
  originalName: string
): Promise<string> {
  const ext = (originalName.split(".").pop() || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const relDir = join("dokumente", parzelleId.replace(/[^A-Za-z0-9]/g, ""));
  await mkdir(join(STORAGE_DIR, relDir), { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(STORAGE_DIR, relDir, name), daten);
  return join(relDir, name);
}

// MIME-Typ nach Endung (für die Auslieferung).
export function mimeFuer(relPfad: string): string {
  const ext = relPfad.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

// Absoluter Pfad aus einem (untrusted) DB-Pfad — verhindert Path-Traversal.
export function sichererPfad(relPfad: string): string | null {
  const abs = resolve(STORAGE_DIR, normalize(relPfad));
  if (abs !== STORAGE_DIR && !abs.startsWith(STORAGE_DIR + "/")) return null;
  return abs;
}

export async function dateiLesen(relPfad: string): Promise<Buffer | null> {
  const abs = sichererPfad(relPfad);
  if (!abs) return null;
  try {
    return await readFile(abs);
  } catch {
    return null;
  }
}
