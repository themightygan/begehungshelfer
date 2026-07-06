#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""docx-Renderer für Mitteilungen/Abmahnungen (docxtpl/Jinja2).

Aufruf:  python3 scripts/render_docx.py <job.json>

Job-Format (Pfade absolut):
{
  "vorlage": ".../vorlagen/abmahnung_verein.docx",
  "ausgabe": "/tmp/out.docx",
  "kontext": {
    ... alle Platzhalter der Vorlage ...,
    "logo": "/pfad/logo.png" | null,             // Bildpfad -> InlineImage 48 mm
    "beanstandungen": [
      { "text": "...", "foto": "1-2"|null, "frist": "30. April 2027"|null,
        "bilder": ["/pfad/foto.jpg", ...] }       // Bildpfade -> InlineImage 55 mm
    ]
  }
}

Härtungen (Audit 2026-07-06):
- Pillow-Reencode ALLER Bilder: die sharp-Pipeline der App strippt EXIF/JFIF-
  Marker, solche JPEGs (und WebP-Logos) erkennt python-docx nicht
  (UnrecognizedImageError). Fotos werden dabei auf max. 900 px verkleinert
  (55-mm-Ziel; hält das docx bei vielen Fotos klein).
- autoescape=True: Nutzertext ("<", "&", ...) darf nie als XML interpretiert
  werden — sonst verfälschte Rechtsdokumente.
- StrictUndefined + Vorab-Validierung: fehlende Pflicht-Platzhalter brechen
  mit klarer Meldung ab, statt still leere Stellen zu rendern (unbestimmte
  Abmahnung = angreifbar).
"""
import io
import json
import sys

import jinja2
from docx.shared import Mm
from docxtpl import DocxTemplate, InlineImage
from PIL import Image, ImageOps

LOGO_MM = 48   # Breite Vereins-/BV-Logo im Briefkopf
FOTO_MM = 55   # Breite eingebetteter Mangel-Fotos
FOTO_MAX_PX = 900

# Optionale Platzhalter: fehlen sie im Kontext, gelten diese Werte.
# Alles andere, was die Vorlage referenziert, ist Pflicht.
OPTIONAL = {
    "logo": None,
    "verein_tel": "",
    "wiederholung": False,
    "historie": False,
    "historie_seit": "",
    "historie_hinweise": "",
    "datum_1_abmahnung": "",
    "ersatzvornahme": False,
    "lageplan": False,
    "anlage": None,
    "betreff_zusatz": None,
    "anrede_form": "Sie",
    "erlaeuterung": False,
    "hinweis_wiederholung": False,
    "fotos_beigefuegt": False,
}


def bild(tpl: DocxTemplate, pfad: str, breite_mm: int, max_px: int | None = None) -> InlineImage:
    """Bild als JPEG re-encoden (python-docx-kompatibel) und einbetten."""
    # exif_transpose: extern zugelieferte Bilder mit Orientation-Tag nicht
    # gedreht einbetten (App-Fotos sind gestrippt, da ist es ein No-op).
    img = ImageOps.exif_transpose(Image.open(pfad)).convert("RGB")
    if max_px and max(img.size) > max_px:
        img.thumbnail((max_px, max_px))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    buf.seek(0)
    return InlineImage(tpl, buf, width=Mm(breite_mm))


def main() -> int:
    if len(sys.argv) != 2:
        print("Aufruf: render_docx.py <job.json>", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as f:
        job = json.load(f)

    tpl = DocxTemplate(job["vorlage"])
    kontext = dict(job["kontext"])

    env = jinja2.Environment(autoescape=True, undefined=jinja2.StrictUndefined)

    # Pflichtfelder vorab prüfen -> klare Fehlermeldung statt Render-Abbruch
    # mitten im Dokument (oder stiller Leere ohne StrictUndefined).
    benoetigt = tpl.get_undeclared_template_variables(env)
    fuer_render = {**OPTIONAL, **kontext}
    fehlt = sorted(v for v in benoetigt if v not in fuer_render)
    if fehlt:
        print(f"Pflicht-Platzhalter fehlen im Kontext: {', '.join(fehlt)}", file=sys.stderr)
        return 3
    # Leere Beanstandungsliste = juristisch sinnloses Schreiben ("...folgende
    # Beanstandungen:" gefolgt von nichts) -> ablehnen statt rendern.
    if "beanstandungen" in benoetigt and not fuer_render.get("beanstandungen"):
        print("Keine Beanstandungen im Kontext — leeres Schreiben wird nicht erzeugt.", file=sys.stderr)
        return 3

    # Bildpfade -> InlineImage (Logo + Fotos je Beanstandung)
    if fuer_render.get("logo"):
        fuer_render["logo"] = bild(tpl, fuer_render["logo"], LOGO_MM)
    for b in fuer_render.get("beanstandungen", []):
        b.setdefault("foto", None)
        b.setdefault("frist", None)
        b["bilder"] = [bild(tpl, p, FOTO_MM, FOTO_MAX_PX) for p in (b.get("bilder") or [])]

    tpl.render(fuer_render, env)
    tpl.save(job["ausgabe"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # kompakte Fehlermeldung für den Node-Wrapper
        print(f"{type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
