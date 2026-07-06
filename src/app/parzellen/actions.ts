"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { dokumentSpeichern } from "@/lib/storage";

// Stammdaten einer Parzelle aktualisieren (+ Ereignis-Eintrag mit Datum).
export async function updateStammdaten(parzelleId: string, formData: FormData) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const groesse = parseInt(s("groesseM2"), 10);
  await prisma.parzelle.update({
    where: { id: parzelle.id },
    data: {
      nachname: s("nachname"),
      vorname: s("vorname"),
      email: s("email"),
      telefon: s("telefon"),
      strasse: s("strasse"),
      plz: s("plz"),
      ort: s("ort"),
      eintritt: s("eintritt"),
      anrede: ["herr", "frau"].includes(s("anrede")) ? s("anrede") : "",
      anredeStil: s("anredeStil") === "du" ? "du" : "sie",
      status: s("status") || "verpachtet",
      groesseM2: Number.isFinite(groesse) ? groesse : parzelle.groesseM2,
    },
  });
  await prisma.parzelleAenderung.create({
    data: { parzelleId: parzelle.id, art: "stammdaten", notiz: "Stammdaten aktualisiert" },
  });
  revalidatePath(`/parzellen/${parzelleId}`);
  revalidatePath("/parzellen");
}

// Geführter Pächterwechsel: alten Pächter im Ereignis festhalten, neuen setzen.
export async function paechterwechsel(parzelleId: string, formData: FormData) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const alt = `${parzelle.nachname} ${parzelle.vorname}`.trim() || "—";
  const neuNach = String(formData.get("nachname") ?? "").trim();
  const neuVor = String(formData.get("vorname") ?? "").trim();
  const datumRaw = String(formData.get("datum") ?? "").trim();
  await prisma.parzelle.update({
    where: { id: parzelle.id },
    data: {
      nachname: neuNach,
      vorname: neuVor,
      email: "",
      telefon: "",
      eintritt: datumRaw || parzelle.eintritt,
      anrede: "", // neuer Pächter -> Anrede unbekannt, wird nachgefragt
      anredeStil: "sie",
      status: "verpachtet",
    },
  });
  await prisma.parzelleAenderung.create({
    data: {
      parzelleId: parzelle.id,
      datum: datumRaw ? new Date(datumRaw) : new Date(),
      art: "paechterwechsel",
      notiz: `Pächterwechsel: ${alt} → ${`${neuNach} ${neuVor}`.trim()}`,
    },
  });
  revalidatePath(`/parzellen/${parzelleId}`);
  revalidatePath("/parzellen");
}

// Freies Ereignis erfassen (Umzug, Kontakt, Status, Sonstiges …).
export async function ereignisHinzufuegen(parzelleId: string, formData: FormData) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const datumRaw = String(formData.get("datum") ?? "").trim();
  await prisma.parzelleAenderung.create({
    data: {
      parzelleId: parzelle.id,
      datum: datumRaw ? new Date(datumRaw) : new Date(),
      art: String(formData.get("art") ?? "sonstiges"),
      notiz: String(formData.get("notiz") ?? ""),
    },
  });
  revalidatePath(`/parzellen/${parzelleId}`);
}

export async function ereignisLoeschen(parzelleId: string, id: number) {
  await prisma.parzelleAenderung.delete({ where: { id } });
  revalidatePath(`/parzellen/${parzelleId}`);
}

// --- Akte: Dokument-Anhänge je Parzelle (Schreiben, E-Mails, Wertermittlungen) ---
export async function uploadDokument(parzelleId: string, formData: FormData) {
  const parzelle = await prisma.parzelle.findUniqueOrThrow({ where: { parzelleId } });
  const datei = formData.get("datei");
  if (datei instanceof File && datei.size > 0) {
    const buf = Buffer.from(await datei.arrayBuffer());
    const pfad = await dokumentSpeichern(parzelleId, buf, datei.name);
    // Datum wählbar (rückdatierbar) — alte Schreiben werden mit ihrem
    // Original-Datum in die Akte einsortiert; leer = heute.
    const datumRaw = String(formData.get("datum") ?? "").trim();
    await prisma.dokument.create({
      data: {
        parzelleId: parzelle.id,
        typ: String(formData.get("typ") ?? "sonstiges"),
        dateipfad: pfad,
        notiz: String(formData.get("notiz") ?? ""),
        ...(datumRaw ? { datum: new Date(datumRaw) } : {}),
      },
    });
  }
  revalidatePath(`/parzellen/${parzelleId}`);
}

export async function removeDokument(parzelleId: string, dokumentId: number) {
  await prisma.dokument.delete({ where: { id: dokumentId } });
  revalidatePath(`/parzellen/${parzelleId}`);
}
