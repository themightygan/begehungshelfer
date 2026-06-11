import { redirect } from "next/navigation";
import { getAktiveRunde } from "@/lib/runde";
import { Workspace } from "./workspace/Workspace";

export const dynamic = "force-dynamic";

// Schlanke Server-Shell: online ist die Session die Autorität (keine aktive
// Runde -> Start). Die eigentliche Begehung (Plan + Erfassung) läuft komplett
// im Client-Workspace — offline liefert der Service Worker diese Shell aus dem
// Cache und der Workspace lädt seinen Stand aus IndexedDB.
export default async function BegehungSeite() {
  const aktiv = await getAktiveRunde();
  if (!aktiv) redirect("/");
  return <Workspace />;
}
