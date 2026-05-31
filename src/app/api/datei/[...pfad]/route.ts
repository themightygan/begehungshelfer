import { NextRequest } from "next/server";
import { dateiLesen, mimeFuer } from "@/lib/storage";

// Liefert verarbeitete Fotos aus STORAGE_DIR aus (liegt außerhalb von /public).
// Path-Traversal wird in sichererPfad() abgefangen.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pfad: string[] }> }
) {
  const { pfad } = await params;
  const relPfad = pfad.join("/");
  const buf = await dateiLesen(relPfad);
  if (!buf) return new Response("Nicht gefunden", { status: 404 });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFuer(relPfad),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
