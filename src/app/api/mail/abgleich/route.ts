import { gesendetAbgleich } from "@/lib/mail";

// Postfach-Abgleich als Endpunkt: für Verifikation und den späteren täglichen
// Cron (curl mit Session-Cookie von localhost). Zugriff: Middleware (Session).
export async function POST() {
  const ergebnis = await gesendetAbgleich();
  return Response.json(ergebnis, { status: ergebnis.ok ? 200 : 502 });
}
