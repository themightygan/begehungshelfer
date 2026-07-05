"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { passwortHashen } from "@/lib/passwort";

// Einstellungen: Anlagen/Parzellen anlegen, Vorstand pflegen (inkl. Logins).
// Alle Actions liefern FormState für Fehlermeldungen via useActionState.

export type FormState = { fehler?: string; ok?: boolean };

export async function anlageAnlegen(_prev: FormState, formData: FormData): Promise<FormState> {
  const kuerzel = String(formData.get("kuerzel") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[A-Z]{1,3}$/.test(kuerzel)) return { fehler: "Kürzel: 1–3 Buchstaben." };
  if (!name) return { fehler: "Name fehlt." };
  if (await prisma.anlage.findUnique({ where: { kuerzel } })) {
    return { fehler: `Kürzel „${kuerzel}" existiert bereits.` };
  }
  await prisma.anlage.create({ data: { kuerzel, name } });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function anlageUmbenennen(
  anlageId: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fehler: "Name fehlt." };
  await prisma.anlage.update({ where: { id: anlageId }, data: { name } });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function parzelleAnlegen(
  anlageId: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const anlage = await prisma.anlage.findUnique({ where: { id: anlageId } });
  if (!anlage) return { fehler: "Anlage nicht gefunden." };
  const nummer = Number(formData.get("nummer"));
  const index = String(formData.get("index") ?? "").trim().toLowerCase();
  if (!Number.isInteger(nummer) || nummer <= 0) return { fehler: "Nummer: positive ganze Zahl." };
  if (!/^[a-z]{0,2}$/.test(index)) return { fehler: "Zusatz: höchstens 2 Kleinbuchstaben (z. B. a)." };
  const parzelleId = `${anlage.kuerzel}${nummer}${index}`;
  if (await prisma.parzelle.findUnique({ where: { parzelleId } })) {
    return { fehler: `Parzelle ${parzelleId} existiert bereits.` };
  }
  // Neue Parzellen starten unverpachtet — Pächter-Stammdaten in der Akte pflegen.
  await prisma.parzelle.create({
    data: { parzelleId, anlageId, nummer, index, status: "nicht_verpachtet" },
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function vorstandAnlegen(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fehler: "Name fehlt." };
  if (await prisma.vorstand.findUnique({ where: { name } })) {
    return { fehler: `„${name}" existiert bereits.` };
  }
  const max = await prisma.vorstand.aggregate({ _max: { sortierung: true } });
  await prisma.vorstand.create({
    data: { name, sortierung: (max._max.sortierung ?? 0) + 1 },
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function vorstandAktualisieren(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { fehler: "Name fehlt." };
  // Login lowercased die Eingabe -> hier genauso normalisiert speichern.
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const aktiv = formData.get("aktiv") === "1";
  const passwortNeu = String(formData.get("passwortNeu") ?? "");
  const loginEntfernen = formData.get("loginEntfernen") === "1";

  const daten: {
    name: string;
    email: string | null;
    aktiv: boolean;
    passwortHash?: string | null;
    passwortSalt?: string | null;
  } = { name, email, aktiv };
  if (loginEntfernen) {
    daten.passwortHash = null;
    daten.passwortSalt = null;
  } else if (passwortNeu) {
    const { hash, salt } = passwortHashen(passwortNeu);
    daten.passwortHash = hash;
    daten.passwortSalt = salt;
  }

  try {
    await prisma.vorstand.update({ where: { id }, data: daten });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && e.code === "P2002") {
      return { fehler: "Name oder E-Mail wird bereits verwendet." };
    }
    throw e;
  }
  revalidatePath("/einstellungen");
  return { ok: true };
}
