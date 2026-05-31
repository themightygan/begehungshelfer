import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { logout } from "./login/actions";
import "./globals.css";

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
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold text-emerald-800">
              🌱 Begehungshelfer
            </Link>
            {session.loggedIn && (
              <form action={logout}>
                <button className="text-sm text-stone-500 hover:text-stone-800">
                  Abmelden
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
