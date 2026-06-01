import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

// Schützt ALLE Routen außer /login und statischen Assets.
// (Audit: Cloudflare Access ist die zweite Schicht in Produktion.)
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  const istLogin = req.nextUrl.pathname === "/login";

  if (!session.loggedIn && !istLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (session.loggedIn && istLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // Öffentliche, nicht-sensible Assets ausnehmen: Logo (/img), App-Icons + Manifest
  // (Favicon/Login-Seite/Homescreen laden teils ohne Session-Cookie).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|img|icon|apple-icon|manifest).*)",
  ],
};
