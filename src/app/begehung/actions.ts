"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/runde";

// Begehung starten: Anlage + Teilnehmer wählen -> neue Runde, als aktiv merken.
export async function begehungStarten(formData: FormData) {
  const anlageId = Number(formData.get("anlageId"));
  const anlage = await prisma.anlage.findUniqueOrThrow({ where: { id: anlageId } });
  const teilnehmer = formData
    .getAll("teilnehmer")
    .map(String)
    .filter(Boolean);
  const art = formData.get("art") === "nachbegehung" ? "nachbegehung" : "begehung";
  const titel = art === "nachbegehung" ? "Nachbegehung" : "Begehung";

  const datum = new Date();
  const runde = await prisma.begehungsrunde.create({
    data: {
      anlageId,
      datum,
      art,
      bezeichnung: `${titel} ${datum.toLocaleDateString("de-DE")} – ${anlage.name}`,
      teilnehmende: teilnehmer.join(", "),
      status: "offen",
    },
  });

  const session = await getSession();
  session.rundeId = runde.id;
  await session.save();
  redirect("/begehung");
}

export async function begehungFortsetzen(rundeId: number) {
  const session = await getSession();
  session.rundeId = rundeId;
  await session.save();
  redirect("/begehung");
}

export async function begehungVerlassen() {
  const session = await getSession();
  session.rundeId = undefined;
  await session.save();
  redirect("/");
}

// Laufende Begehung abbrechen: Runde + alle erfassten Daten löschen
// (Befunde/Mängel/Beete/Fotos via Cascade). Nur offene Runden. Archiv/Dokumente
// (parzellengebunden) bleiben unberührt. Bestätigung erfolgt im UI.
export async function begehungAbbrechen(rundeId: number) {
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  if (runde && runde.status === "offen") {
    await prisma.begehungsrunde.delete({ where: { id: rundeId } });
  }
  const session = await getSession();
  if (session.rundeId === rundeId) {
    session.rundeId = undefined;
    await session.save();
  }
  revalidatePath("/");
  redirect("/");
}

// Abschluss: Runde einfrieren (unveränderlich), aktive Begehung beenden,
// zur Berichte-Übersicht (PDFs auf Abruf) springen.
export async function begehungAbschliessen() {
  const session = await getSession();
  const rundeId = session.rundeId;
  if (!rundeId) redirect("/");
  await prisma.begehungsrunde.update({
    where: { id: rundeId },
    // abgeschlossenAm startet die 48-h-Gnadenfrist für offline nachgereichte Medien.
    data: { status: "abgeschlossen", abgeschlossenAm: new Date() },
  });
  session.rundeId = undefined;
  await session.save();
  revalidatePath("/");
  redirect(`/begehung/berichte/${rundeId}`);
}
