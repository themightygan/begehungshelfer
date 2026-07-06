import { NextRequest } from "next/server";
import { parzellenBericht } from "@/lib/bericht";

// Bericht-PDF ausliefern — der eigentliche Bau liegt in src/lib/bericht.ts
// (geteilt mit den E-Mail-Aktionen der Begehungsansicht).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ parzelleId: string }> }
) {
  const { parzelleId } = await params;
  const rundeId = Number(req.nextUrl.searchParams.get("rundeId")) || null;

  const bericht = await parzellenBericht(parzelleId, rundeId);
  if (!bericht) return new Response("Parzelle nicht gefunden", { status: 404 });

  return new Response(new Uint8Array(bericht.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${bericht.dateiname}"`,
    },
  });
}
