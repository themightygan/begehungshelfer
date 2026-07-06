import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getIronSession } from "iron-session";
import { Settings, Sprout } from "lucide-react";
import { sessionOptions, type SessionData } from "@/lib/session";
import { logout } from "./login/actions";
import { ZoomControl } from "./ZoomControl";
import { MediaSync } from "./MediaSync";
import { SWRegister } from "./SWRegister";
import "./globals.css";

// Vereinslogo zeigen, sobald public/img/logo.png vorhanden ist (sonst Emoji).
const HAT_LOGO = existsSync(join(process.cwd(), "public/img/logo.png"));

export const metadata: Metadata = {
  title: "Begehungshelfer",
  description: "Gartenbegehungen Gartenfreunde Stuttgart Sillenbuch e.V.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  return (
    <html lang="de">
      <body className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          {/* flex-wrap: auf schmalen Screens/großem Zoom bricht die rechte
              Gruppe in eine zweite Zeile statt den Titel zu überlagern. */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-emerald-800">
              {HAT_LOGO ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/img/logo.png" alt="Vereinslogo" className="h-12 w-auto" />
              ) : (
                <Sprout className="h-7 w-7" aria-hidden />
              )}
              Begehungshelfer
            </Link>
            <div className="flex items-center gap-3">
              {session.loggedIn && <SWRegister />}
              {session.loggedIn && <MediaSync />}
              <ZoomControl />
              {session.loggedIn && (
                <Link
                  href="/einstellungen"
                  title="Einstellungen"
                  aria-label="Einstellungen"
                  className="inline-flex items-center rounded px-2 py-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-800"
                >
                  <Settings className="h-5 w-5" aria-hidden />
                </Link>
              )}
              {session.loggedIn && (
                <form action={logout}>
                  <button className="rounded px-3 py-1.5 text-base text-stone-500 hover:bg-stone-100 hover:text-stone-800">
                    Abmelden
                  </button>
                </form>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
