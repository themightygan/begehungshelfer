// Server-seitige Session-Helfer für die aktive Begehungsrunde.
// NICHT in der Middleware verwenden (next/headers ist dort nicht verfügbar).
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./session";
import { prisma } from "./db";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getAktiveRundeId(): Promise<number | undefined> {
  return (await getSession()).rundeId;
}

// Aktive Runde inkl. Validierung: existiert sie noch und ist sie offen?
// Schützt vor "verwaisten" Sessions (z. B. nach Löschen einer Test-Begehung).
export async function getAktiveRunde() {
  const id = (await getSession()).rundeId;
  if (!id) return null;
  const runde = await prisma.begehungsrunde.findUnique({ where: { id } });
  if (!runde || runde.status !== "offen") return null;
  return runde;
}
