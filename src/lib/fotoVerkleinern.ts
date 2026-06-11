// Foto clientseitig verkleinern, BEVOR es in die Upload-Queue wandert.
// Treiber: langsames Mobilfunknetz im Feld — ein iPhone-Original (4–8 MB) wird
// zu ~200–400 KB; der Upload wird 10–25× schneller. Die Server-Pipeline
// (HEIC-Konvertierung, Resize, EXIF-Strip) bleibt als Netz bestehen.
//
// Fallback: kann der Browser die Datei nicht dekodieren (z. B. HEIC außerhalb
// von Safari), wird das Original gepuffert — der Server verarbeitet es dann.
import { FOTO_MAX_KANTE } from "./constants";

const JPEG_QUALITAET = 0.8;

export async function fotoVerkleinern(datei: Blob): Promise<Blob> {
  try {
    let bitmap: ImageBitmap;
    try {
      // EXIF-Orientierung anwenden (Canvas-JPEG hat keine EXIF-Daten mehr).
      bitmap = await createImageBitmap(datei, { imageOrientation: "from-image" });
    } catch {
      // Ältere Browser kennen die Option nicht -> ohne (dort meist Spec-Default).
      bitmap = await createImageBitmap(datei);
    }

    const skala = Math.min(1, FOTO_MAX_KANTE / Math.max(bitmap.width, bitmap.height));
    const breite = Math.max(1, Math.round(bitmap.width * skala));
    const hoehe = Math.max(1, Math.round(bitmap.height * skala));

    const canvas = document.createElement("canvas");
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext("2d");
    if (!ctx) return datei;
    ctx.drawImage(bitmap, 0, 0, breite, hoehe);
    bitmap.close();

    const jpeg = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", JPEG_QUALITAET)
    );
    // Nur verwenden, wenn wirklich kleiner (winzige Bilder nicht aufblähen).
    return jpeg && jpeg.size < datei.size ? jpeg : datei;
  } catch {
    return datei;
  }
}
