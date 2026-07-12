import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BAUSTEINE } from "@/lib/bausteine";
import { BemerkungenClient } from "./BemerkungenClient";

export const dynamic = "force-dynamic";

// Bemerkungs-Prüfung einer Begehungsrunde (Review-Seite, online):
// lokales Ollama schlägt aus der Freitext-Bemerkung enthaltene Mängel vor,
// zu Mangel-Zeilen werden nur bestätigte Vorschläge.
export default async function BemerkungenSeite({
  params,
}: {
  params: Promise<{ rundeId: string }>;
}) {
  const rundeId = Number((await params).rundeId);
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  if (!runde) notFound();
  const bausteine = BAUSTEINE.map((b) => ({ id: b.id, label: b.label, bereich: b.bereich }));
  return (
    <BemerkungenClient rundeId={rundeId} bezeichnung={runde.bezeichnung} bausteine={bausteine} />
  );
}
