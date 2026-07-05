"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { passwortHashen } from "@/lib/passwort";
import { logoSpeichern, dateiLoeschen } from "@/lib/storage";

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

// Anlage endgültig löschen — nur ohne Historie (Runden/Befunde/Dokumente/
// Archiv-Fotos/Parzellen-Änderungen), sonst Abbruch. Sicherheitsfrage: der
// Anlagen-Name muss exakt eingetippt werden (Client blockiert Einfügen, Server
// validiert). Checks + Delete in EINER Transaktion — kein Fenster, in dem
// parallel angelegte Dokumente/Fotos per Cascade stumm mitgelöscht würden;
// Runde/Befund sind zusätzlich ON DELETE RESTRICT.
export async function anlageLoeschen(
  anlageId: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const anlage = await prisma.anlage.findUnique({ where: { id: anlageId } });
  if (!anlage) return { fehler: "Anlage nicht gefunden." };

  const bestaetigung = String(formData.get("bestaetigung") ?? "").trim();
  if (bestaetigung !== anlage.name) {
    return { fehler: "Bestätigung stimmt nicht mit dem Anlagen-Namen überein." };
  }

  const ergebnis = await prisma.$transaction(async (tx): Promise<FormState> => {
    const runden = await tx.begehungsrunde.count({ where: { anlageId } });
    const befunde = await tx.befund.count({ where: { parzelle: { anlageId } } });
    const dokumente = await tx.dokument.count({ where: { parzelle: { anlageId } } });
    const archivFotos = await tx.archivFoto.count({ where: { parzelle: { anlageId } } });
    const aenderungen = await tx.parzelleAenderung.count({ where: { parzelle: { anlageId } } });
    if (runden || befunde || dokumente || archivFotos || aenderungen) {
      return {
        fehler:
          `Anlage „${anlage.name}" hat Historie (${runden} Runden, ${befunde} Befunde, ` +
          `${dokumente} Dokumente, ${archivFotos} Archiv-Fotos, ${aenderungen} Parzellen-Änderungen) ` +
          "und kann nicht gelöscht werden. Löschen ist nur für leere, versehentlich angelegte Anlagen gedacht.",
      };
    }
    await tx.parzelle.deleteMany({ where: { anlageId } });
    await tx.anlage.delete({ where: { id: anlageId } });
    return { ok: true };
  });
  if (ergebnis.ok) revalidatePath("/einstellungen");
  return ergebnis;
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

// Vorstand endgültig löschen — die Sicherheitsfrage wird auch serverseitig
// verlangt (bestaetigt=1 aus dem Bestätigungs-Formular). Gefahrlos für die
// Historie: teilnehmende-Strings alter Runden sind reine Text-Snapshots.
// Aussperren unmöglich — APP_USERS (.env) bleibt als Login-Fallback.
export async function vorstandLoeschen(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  if (formData.get("bestaetigt") !== "1") return { fehler: "Löschen nicht bestätigt." };
  const v = await prisma.vorstand.findUnique({ where: { id } });
  if (!v) return { fehler: "Mitglied nicht gefunden." };
  await prisma.vorstand.delete({ where: { id } });
  revalidatePath("/einstellungen");
  return { ok: true };
}

// --- Vereins-Stammdaten (Singleton, id = 1) ---

const VEREIN_DEFAULT = { id: 1 };

export async function vereinSpeichern(_prev: FormState, formData: FormData): Promise<FormState> {
  const feld = (name: string) => String(formData.get(name) ?? "").trim();
  const daten: Record<string, string> = {
    name: feld("name"),
    vorsitzender: feld("vorsitzender"),
    adresse: String(formData.get("adresse") ?? "").trim(), // mehrzeilig
    email: feld("email").toLowerCase(),
    emailBenutzer: feld("emailBenutzer"),
    imapServer: feld("imapServer"),
    smtpServer: feld("smtpServer"),
    bezirksverbandEmail: feld("bezirksverbandEmail").toLowerCase(),
  };
  // Passwort write-only: leer = unverändert; Checkbox löscht es.
  const passwortNeu = String(formData.get("passwortNeu") ?? "");
  if (formData.get("passwortEntfernen") === "1") daten.emailPasswort = "";
  else if (passwortNeu) daten.emailPasswort = passwortNeu;

  await prisma.verein.upsert({
    where: { id: 1 },
    update: daten,
    create: { ...VEREIN_DEFAULT, ...daten },
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function vereinLogoHochladen(_prev: FormState, formData: FormData): Promise<FormState> {
  const datei = formData.get("logo");
  if (!(datei instanceof File) || datei.size === 0) return { fehler: "Keine Datei gewählt." };
  if (datei.size > 2 * 1024 * 1024) return { fehler: "Logo zu groß (max. 2 MB)." };
  const pfad = await logoSpeichern(Buffer.from(await datei.arrayBuffer()));
  if (!pfad) return { fehler: "Kein gültiges Bild — erlaubt sind PNG, JPEG oder WebP." };

  const alt = await prisma.verein.findUnique({ where: { id: 1 } });
  await prisma.verein.upsert({
    where: { id: 1 },
    update: { logoPfad: pfad },
    create: { ...VEREIN_DEFAULT, logoPfad: pfad },
  });
  if (alt?.logoPfad) await dateiLoeschen(alt.logoPfad);
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function vereinLogoEntfernen(_prev: FormState, _formData: FormData): Promise<FormState> {
  const verein = await prisma.verein.findUnique({ where: { id: 1 } });
  if (!verein?.logoPfad) return { fehler: "Kein Logo vorhanden." };
  await prisma.verein.update({ where: { id: 1 }, data: { logoPfad: null } });
  await dateiLoeschen(verein.logoPfad);
  revalidatePath("/einstellungen");
  return { ok: true };
}
