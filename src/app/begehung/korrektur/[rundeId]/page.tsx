import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { KorrekturClient } from "./KorrekturClient";

export const dynamic = "force-dynamic";

// KI-Textkorrektur einer Begehungsrunde (Review-Seite, online):
// Vorschläge kommen vom lokalen Ollama, geschrieben wird NUR nach Bestätigung.
export default async function KorrekturSeite({
  params,
}: {
  params: Promise<{ rundeId: string }>;
}) {
  const rundeId = Number((await params).rundeId);
  const runde = await prisma.begehungsrunde.findUnique({ where: { id: rundeId } });
  if (!runde) notFound();
  return <KorrekturClient rundeId={rundeId} bezeichnung={runde.bezeichnung} />;
}
