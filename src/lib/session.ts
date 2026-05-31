// Auth = EIN gemeinsames App-Passwort (kein User-Modell), via iron-session.
// Passwort-Vergleich erfolgt in der Login-Action mit crypto.timingSafeEqual.
import type { SessionOptions } from "iron-session";

export interface SessionData {
  loggedIn: boolean;
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
