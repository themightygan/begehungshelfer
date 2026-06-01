"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

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
