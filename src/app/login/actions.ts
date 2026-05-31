"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { timingSafeEqual } from "node:crypto";
import { sessionOptions, type SessionData } from "@/lib/session";

export type LoginState = { fehler?: string };

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const eingabe = String(formData.get("passwort") ?? "");
  const erwartet = process.env.APP_PASSWORD ?? "";

  // Konstantzeit-Vergleich (Audit-Entscheidung: timingSafeEqual, kein bcrypt).
  // Buffer müssen gleich lang sein -> Länge separat prüfen.
  const a = Buffer.from(eingabe, "utf8");
  const b = Buffer.from(erwartet, "utf8");
  const ok = erwartet.length > 0 && a.length === b.length && timingSafeEqual(a, b);

  if (!ok) return { fehler: "Falsches Passwort." };

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.loggedIn = true;
  await session.save();
  redirect("/");
}

export async function logout() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
  redirect("/login");
}
