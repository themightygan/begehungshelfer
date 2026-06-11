"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { fotoVerarbeitenUndSpeichern } from "@/lib/storage";
import { FOTO_MAX_PRO_BEFUND } from "@/lib/constants";

// Nachträgliche Bearbeitung einer Begehung (Entscheidung 2026-06-11: kein
// hartes Einfrieren — Texte müssen korrigierbar, Fotos löschbar/ergänzbar
// bleiben). Schreibtischarbeit, online, klassische Server Actions.

export async function aktualisiereBefund(befundId: number, pfad: string, formData: FormData) {
  const gutGemacht = formData.get("gutGemacht") === "1";
  await prisma.befund.update({
    where: { id: befundId },
    data: {
      stufe: String(formData.get("stufe") || "neutral"),
      notiz: String(formData.get("notiz") ?? ""),
      gutGemacht,
      plakettenNotiz: gutGemacht ? String(formData.get("plakettenNotiz") ?? "") : "",
      diktatNachgereicht: String(formData.get("diktatNachgereicht") ?? ""),
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereKompensation(befundId: number, pfad: string, formData: FormData) {
  const zahl = (k: string) => {
    const v = parseFloat(String(formData.get(k) ?? "0").replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const ganz = (k: string) => {
    const v = parseInt(String(formData.get(k) ?? "0"), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  await prisma.befund.update({
    where: { id: befundId },
    data: {
      kompObstAnzahl: ganz("obstAnzahl"),
      kompObstFlaecheM2: zahl("obstFlaeche"),
      kompBeerenAnzahl: ganz("beerenAnzahl"),
      kompBeerenFlaecheM2: zahl("beerenFlaeche"),
      kompensationNotiz: String(formData.get("kompNotiz") ?? ""),
      kompensationAusreichend: formData.get("ausreichend") === "1",
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereMangel(mangelId: number, pfad: string, formData: FormData) {
  const fristRaw = String(formData.get("frist") ?? "").trim();
  const punktRaw = formData.get("punkt"); // nur bei Freitext-Mangel im Formular
  await prisma.mangel.update({
    where: { id: mangelId },
    data: {
      notiz: String(formData.get("notiz") ?? ""),
      frist: fristRaw ? new Date(fristRaw) : null,
      diktatNachgereicht: String(formData.get("diktatNachgereicht") ?? ""),
      ...(punktRaw !== null ? { punkt: String(punktRaw) } : {}),
    },
  });
  revalidatePath(pfad);
}

// Beet nachträglich anlegen (z. B. Korrektur aus der Mängelliste: Fläche wurde
// bei der Begehung nicht erfasst oder hat sich nach Behebung geändert).
export async function beetAnlegen(befundId: number, pfad: string, formData: FormData) {
  const v = parseFloat(String(formData.get("flaeche") ?? "0").replace(",", "."));
  await prisma.beet.create({
    data: {
      befundId,
      bezeichnung: String(formData.get("bezeichnung") ?? ""),
      flaecheM2: Number.isFinite(v) && v >= 0 ? v : 0,
    },
  });
  revalidatePath(pfad);
}

export async function aktualisiereBeet(beetId: number, pfad: string, formData: FormData) {
  const v = parseFloat(String(formData.get("flaeche") ?? "0").replace(",", "."));
  await prisma.beet.update({
    where: { id: beetId },
    data: {
      bezeichnung: String(formData.get("bezeichnung") ?? ""),
      flaecheM2: Number.isFinite(v) && v >= 0 ? v : 0,
    },
  });
  revalidatePath(pfad);
}

// Foto per Drag & Drop umhängen: Gesamtansicht <-> Mangel <-> Beet <-> Kompensation.
// Ziel muss zum selben Befund gehören (Drag passiert nur innerhalb einer Seite,
// die Prüfung schützt vor veralteten/manipulierten Requests).
export async function verschiebeFoto(
  fotoId: number,
  ziel: { mangelId?: number | null; beetId?: number | null; kontext: string },
  pfad: string
) {
  const foto = await prisma.foto.findUnique({ where: { id: fotoId } });
  if (!foto) return;
  let mangelId: number | null = null;
  let beetId: number | null = null;
  let kontext = ["zustand", "kompensation"].includes(ziel.kontext) ? ziel.kontext : "zustand";
  if (ziel.mangelId != null) {
    const m = await prisma.mangel.findUnique({ where: { id: Number(ziel.mangelId) } });
    if (!m || m.befundId !== foto.befundId) return;
    mangelId = m.id;
    kontext = "mangel";
  } else if (ziel.beetId != null) {
    const b = await prisma.beet.findUnique({ where: { id: Number(ziel.beetId) } });
    if (!b || b.befundId !== foto.befundId) return;
    beetId = b.id;
    kontext = "beet";
  }
  await prisma.foto.update({ where: { id: fotoId }, data: { mangelId, beetId, kontext } });
  revalidatePath(pfad);
}

export async function loescheFotoNachtraeglich(fotoId: number, pfad: string) {
  await prisma.foto.delete({ where: { id: fotoId } }).catch(() => {});
  revalidatePath(pfad);
}

// Fotos nachträglich ergänzen (z. B. von der Kamera nachgereichte Bilder).
export async function fotosNachtraeglich(
  befundId: number,
  ziel: { mangelId?: number | null; beetId?: number | null; kontext: string },
  pfad: string,
  formData: FormData
) {
  const vorhanden = await prisma.foto.count({ where: { befundId } });
  const dateien = formData
    .getAll("fotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  let frei = Math.max(0, FOTO_MAX_PRO_BEFUND - vorhanden);
  for (const datei of dateien) {
    if (frei <= 0) break;
    const buf = Buffer.from(await datei.arrayBuffer());
    const gespeichert = await fotoVerarbeitenUndSpeichern(befundId, buf);
    await prisma.foto.create({
      data: {
        befundId,
        mangelId: ziel.mangelId ?? null,
        beetId: ziel.beetId ?? null,
        kontext: ziel.kontext,
        dateipfad: gespeichert,
      },
    });
    frei--;
  }
  revalidatePath(pfad);
}
