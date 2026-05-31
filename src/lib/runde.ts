// Server-seitige Session-Helfer für die aktive Begehungsrunde.
// NICHT in der Middleware verwenden (next/headers ist dort nicht verfügbar).
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./session";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getAktiveRundeId(): Promise<number | undefined> {
  return (await getSession()).rundeId;
}
