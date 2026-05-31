"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/runde";
import { fotoVerarbeitenUndSpeichern, dokumentSpeichern } from "@/lib/storage";
import { FOTO_MAX_PRO_BEFUND, type FotoKontext } from "@/lib/constants";

// Befund je (aktive Runde + Parzelle) sicherstellen, befundId zurückgeben.
// Erfordert eine aktive Begehung (session.rundeId) — die Seite garantiert das.
export async function ensureBefund(parzelleId: string) {
  const session = await getSession();
  if (!session.rundeId) throw new Error("Keine aktive Begehung.");

  const parzelle = await prisma.parzelle.findUniqueOrThrow({
    where: { parzelleId },
  });

  const adresse = [
    parzelle.strasse,
    [parzelle.plz, parzelle.ort].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const paechter = [parzelle.nachname, parzelle.vorname]
    .filter(Boolean)
    .join(" ");

  const befund = await prisma.befund.upsert({
    where: {
      rundeId_parzelleId: { rundeId: session.rundeId, parzelleId: parzelle.id },
    },
    update: {},
    create: {
      rundeId: session.rundeId,
      parzelleId: parzelle.id,
      snapParzelleId: parzelle.parzelleId,
      snapPaechter: paechter,
      snapAdresse: adresse,
    },
  });

  return befund.id;
}

// Gemeinsame Foto-Pipeline: verarbeitet Dateien aus FormData und legt sie an.
async function fotosAusFormData(
  befundId: number,
  formData: FormData,
  opts: { mangelId: number | null; kontext: FotoKontext }
) {
  const vorhanden = await prisma.foto.count({ where: { befundId } });
  const dateien = formData
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  let frei = Math.max(0, FOTO_MAX_PRO_BEFUND - vorhanden);
  for (const datei of dateien) {
    if (frei <= 0) break;
    const buf = Buffer.from(await datei.arrayBuffer());
    const pfad = await fotoVerarbeitenUndSpeichern(befundId, buf);
    await prisma.foto.create({
      data: {
        befundId,
        mangelId: opts.mangelId,
        kontext: opts.kontext,
        dateipfad: pfad,
      },
    });
    frei--;
  }
}

export async function speichereBefund(parzelleId: string, formData: FormData) {
  const befundId = await ensureBefund(parzelleId);
  const gutGemacht = formData.get("gutGemacht") === "1";
  await prisma.befund.update({
    where: { id: befundId },
    data: {
      stufe: (formData.get("stufe") as string) || "neutral",
      notiz: (formData.get("notiz") as string) || "",
      gutGemacht,
      plakettenNotiz: gutGemacht ? String(formData.get("plakettenNotiz") ?? "") : "",
    },
  });
  revalidatePath(`/parzelle/${parzelleId}`);
}

// Befund speichern und zur nächsten Parzelle der Anlage springen
// (oder zurück zur Begehungsübersicht, wenn es die letzte war).
export async function speichernUndWeiter(parzelleId: string, formData: FormData) {
  await speichereBefund(parzelleId, formData);
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const next = await prisma.parzelle.findFirst({
    where: {
      anlageId: parzelle.anlageId,
      OR: [
        { nummer: { gt: parzelle.nummer } },
        { nummer: parzelle.nummer, index: { gt: parzelle.index } },
      ],
    },
    orderBy: [{ nummer: "asc" }, { index: "asc" }],
  });
  redirect(next ? `/parzelle/${next.parzelleId}` : "/begehung");
}

// Gesamtansicht-Fotos (kein konkreter Mangel) — im PDF zur Orientierung zuerst.
export async function uploadUebersichtFotos(parzelleId: string, formData: FormData) {
  const befundId = await ensureBefund(parzelleId);
  await fotosAusFormData(befundId, formData, { mangelId: null, kontext: "zustand" });
  revalidatePath(`/parzelle/${parzelleId}`);
}

// Mangel aus dem Katalog hinzufügen ("Menü"-Klick). Bereich/Punkt werden gesnapshottet.
// katalogId kommt per .bind() (Button-name/value ist bei Server-Actions nicht zuverlässig).
export async function addMangel(parzelleId: string, katalogId: number) {
  const befundId = await ensureBefund(parzelleId);
  const katalog = await prisma.katalog.findUniqueOrThrow({ where: { id: katalogId } });

  // Duplikate vermeiden: gleicher Katalogpunkt nur einmal je Befund.
  const exists = await prisma.mangel.findFirst({ where: { befundId, katalogId } });
  if (!exists) {
    await prisma.mangel.create({
      data: {
        befundId,
        katalogId,
        bereich: katalog.bereich,
        punkt: katalog.punkt,
      },
    });
  }
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function addFreierMangel(parzelleId: string) {
  const befundId = await ensureBefund(parzelleId);
  await prisma.mangel.create({
    data: { befundId, katalogId: null, bereich: "Sonstiges", punkt: "" },
  });
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function updateMangel(
  parzelleId: string,
  mangelId: number,
  formData: FormData
) {
  const fristRaw = String(formData.get("frist") ?? "").trim();
  const punktRaw = formData.get("punkt"); // nur bei Freitext-Mangel im Formular
  await prisma.mangel.update({
    where: { id: mangelId },
    data: {
      notiz: String(formData.get("notiz") ?? ""),
      frist: fristRaw ? new Date(fristRaw) : null,
      ...(punktRaw !== null ? { punkt: String(punktRaw) } : {}),
    },
  });
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function removeMangel(parzelleId: string, mangelId: number) {
  // Fotos hängen per Cascade am Mangel; DB-Zeilen weg, Dateien bleiben (Prototyp).
  await prisma.mangel.delete({ where: { id: mangelId } });
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function uploadMangelFotos(
  parzelleId: string,
  mangelId: number,
  formData: FormData
) {
  const befundId = await ensureBefund(parzelleId);
  await fotosAusFormData(befundId, formData, { mangelId, kontext: "mangel" });
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function loescheFoto(parzelleId: string, fotoId: number) {
  await prisma.foto.delete({ where: { id: fotoId } });
  revalidatePath(`/parzelle/${parzelleId}`);
}

// --- Gemüsebeete (IST vs. SOLL 1/6, UPV §12) ---
const BEET_MAX = 5;

function parseFlaeche(roh: FormDataEntryValue | null): number {
  const n = parseFloat(String(roh ?? "0").replace(",", ".")); // "12,5" -> 12.5
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function addBeet(parzelleId: string, formData: FormData) {
  const befundId = await ensureBefund(parzelleId);
  const count = await prisma.beet.count({ where: { befundId } });
  if (count < BEET_MAX) {
    await prisma.beet.create({
      data: {
        befundId,
        bezeichnung: String(formData.get("bezeichnung") ?? ""),
        flaecheM2: parseFlaeche(formData.get("flaeche")),
      },
    });
  }
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function updateBeet(
  parzelleId: string,
  beetId: number,
  formData: FormData
) {
  await prisma.beet.update({
    where: { id: beetId },
    data: {
      bezeichnung: String(formData.get("bezeichnung") ?? ""),
      flaecheM2: parseFlaeche(formData.get("flaeche")),
    },
  });
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function removeBeet(parzelleId: string, beetId: number) {
  await prisma.beet.delete({ where: { id: beetId } });
  revalidatePath(`/parzelle/${parzelleId}`);
}

// --- Akte: Dokument-Anhänge je Parzelle (Schreiben, E-Mails, Wertermittlungen) ---
export async function uploadDokument(parzelleId: string, formData: FormData) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const datei = formData.get("datei");
  if (datei instanceof File && datei.size > 0) {
    const buf = Buffer.from(await datei.arrayBuffer());
    const pfad = await dokumentSpeichern(parzelleId, buf, datei.name);
    await prisma.dokument.create({
      data: {
        parzelleId: parzelle.id,
        typ: String(formData.get("typ") ?? "sonstiges"),
        dateipfad: pfad,
        notiz: String(formData.get("notiz") ?? ""),
      },
    });
  }
  revalidatePath(`/parzelle/${parzelleId}`);
}

export async function removeDokument(parzelleId: string, dokumentId: number) {
  await prisma.dokument.delete({ where: { id: dokumentId } });
  revalidatePath(`/parzelle/${parzelleId}`);
}
