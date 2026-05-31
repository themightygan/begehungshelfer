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

  const datum = new Date();
  const runde = await prisma.begehungsrunde.create({
    data: {
      anlageId,
      datum,
      bezeichnung: `Begehung ${datum.toLocaleDateString("de-DE")} – ${anlage.name}`,
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

// Abschluss: Runde einfrieren (unveränderlich), aktive Begehung beenden,
// zur Berichte-Übersicht (PDFs auf Abruf) springen.
export async function begehungAbschliessen() {
  const session = await getSession();
  const rundeId = session.rundeId;
  if (!rundeId) redirect("/");
  await prisma.begehungsrunde.update({
    where: { id: rundeId },
    data: { status: "abgeschlossen" },
  });
  session.rundeId = undefined;
  await session.save();
  revalidatePath("/");
  redirect(`/begehung/berichte/${rundeId}`);
}
