// Auth = feste Benutzerliste in APP_USERS ("email:passwort;email:passwort"),
// via iron-session. Kein User-Modell in der DB (KISS) — Vergleich erfolgt in
// der Login-Action mit crypto.timingSafeEqual.
import type { SessionOptions } from "iron-session";

export interface SessionData {
  loggedIn: boolean;
  // E-Mail des angemeldeten Benutzers (aus APP_USERS).
  benutzer?: string;
  // ID der aktuell laufenden Begehungsrunde (Erfassungs-Kontext). Undefiniert =
  // keine aktive Begehung -> Parzellenerfassung gesperrt, zuerst "Begehung starten".
  rundeId?: number;
}

export const sessionOptions: SessionOptions = {
  // SESSION_SECRET muss >= 32 Zeichen sein (siehe .env / .env.example).
  password: process.env.SESSION_SECRET as string,
  cookieName: "begehung_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};
