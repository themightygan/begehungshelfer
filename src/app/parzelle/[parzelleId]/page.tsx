import { redirect } from "next/navigation";

// Alte Erfassungs-Route (Stufe 1) — die Erfassung lebt jetzt im Offline-
// Workspace unter /begehung (#p/<Parzelle>). Redirect für Lesezeichen/Verläufe.
export default async function AlteParzellenSeite({
  params,
}: {
  params: Promise<{ parzelleId: string }>;
}) {
  const { parzelleId } = await params;
  redirect(`/begehung#p/${encodeURIComponent(parzelleId)}`);
}
