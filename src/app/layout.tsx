import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { logout } from "./login/actions";
import { ZoomControl } from "./ZoomControl";
import { MediaSync } from "./MediaSync";
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
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-emerald-800">
              {HAT_LOGO ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/img/logo.png" alt="Vereinslogo" className="h-12 w-auto" />
              ) : (
                "🌱"
              )}
              Begehungshelfer
            </Link>
            <div className="flex items-center gap-3">
              {session.loggedIn && <MediaSync />}
              <ZoomControl />
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
