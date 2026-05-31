"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

// "behoben" umschalten — setzt/entfernt behobenAm (kein Überschreiben des
// Ursprungs-Mangels, Audit-Entscheidung). Toggle, damit Fehlklicks korrigierbar sind.
export async function toggleBehoben(mangelId: number) {
  const m = await prisma.mangel.findUniqueOrThrow({ where: { id: mangelId } });
  const istBehoben = m.status === "behoben";
  await prisma.mangel.update({
    where: { id: mangelId },
    data: istBehoben
      ? { status: "offen", behobenAm: null }
      : { status: "behoben", behobenAm: new Date() },
  });
  revalidatePath("/maengel");
}
