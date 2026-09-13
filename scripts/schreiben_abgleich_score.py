#!/usr/bin/env python3
# Scorer der Mess-Harness: liest gen.json (generierte Entwürfe + Pfade zu den
# versandten PDFs), extrahiert den PDF-Text (pymupdf; OCR-Fallback via tesseract
# bei Scans) und misst die Ähnlichkeit mit difflib.
#   - Gesamt-Ähnlichkeit (symmetrisch) Brieftext vs. versandt
#   - "Übernahme" je Beanstandung: wie viel unseres Satzes im Finaltext überlebt
# read-only. Aufruf: python schreiben_abgleich_score.py <gen.json>
import sys, os, re, json, subprocess, tempfile
from difflib import SequenceMatcher
import pymupdf

def extrahiere(pdf):
    doc = pymupdf.open(pdf)
    txt = "\n".join(p.get_text() for p in doc)
    if len(txt.strip()) >= 300:
        doc.close(); return txt, "text"
    # Scan -> OCR
    out = []
    with tempfile.TemporaryDirectory() as d:
        for pg in doc:
            png = os.path.join(d, "p.png"); pg.get_pixmap(dpi=200).save(png)
            r = subprocess.run(["tesseract", png, "stdout", "-l", "deu", "--psm", "4"],
                               capture_output=True, text=True)
            out.append(r.stdout)
    doc.close()
    return "\n".join(out), "ocr"

def norm(s):
    s = s.replace("­", "")
    s = re.sub(r"(\w)[-‐]\n\s*(\w)", r"\1\2", s)   # Silbentrennung am Zeilenende
    s = s.replace("\n", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def body(s):
    # Region Anrede .. Grußformel herausschneiden (Briefkopf/Fußzeile raus)
    a = re.search(r"(Lieber|Liebe|Sehr geehrter?|Sehr geehrte)\b", s)
    e = re.search(r"Mit freundlichen Grüßen", s)
    start = a.start() if a else 0
    end = e.start() if e else len(s)
    return s[start:end] if end > start else s

def ratio(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def survival(teil, ganz):
    # Anteil von `teil`, der (in Reihenfolge) in `ganz` wiederkehrt.
    teil = re.sub(r"^\s*\d+\.\s*", "", teil)
    a, b = teil.lower(), ganz.lower()
    if not a: return 0.0
    m = SequenceMatcher(None, a, b).get_matching_blocks()
    return sum(x.size for x in m) / len(a)

def bar(x, n=20):
    return "█" * round(x * n) + "·" * (n - round(x * n))

data = json.load(open(sys.argv[1]))
eintraege = data["eintraege"]
report = ["# Schreiben-Abgleich — Ähnlichkeit Entwurf vs. versandt\n"]
agg = {}
rows = []
for e in eintraege:
    final_raw, quelle = extrahiere(e["finalPdf"])
    gb = norm(body(e["generated"]))
    fb = norm(body(final_raw))
    r = ratio(gb, fb)
    survs = [survival(norm(t), fb) for t in e["beanstandungen"]]
    agg.setdefault(e["typ"], []).append(r)
    rows.append((e["parzelle"], e["typ"], r, e["anzahlMaengel"], e["freitextRoh"], quelle, survs))
    report.append(f"\n## {e['parzelle']} · {e['typ']} · Ähnlichkeit {r:.0%} ({quelle})")
    report.append(f"- Beanstandungen: {e['anzahlMaengel']} (davon Freitext ohne Baustein: {e['freitextRoh']})")
    for t, sv in zip(e["beanstandungen"], survs):
        report.append(f"  - Übernahme {sv:.0%}: {t[:110]}")

rows.sort(key=lambda x: (x[1], x[2]))
print(f"{'Parz':<6}{'Typ':<13}{'Ähnl.':>6}  {'Übernahme/Mangel':<24}{'Mä':>3}{'FT':>3}  Quelle")
print("-" * 78)
for parz, typ, r, nm, ft, q, survs in rows:
    smean = sum(survs)/len(survs) if survs else 0
    print(f"{parz:<6}{typ:<13}{r:>5.0%}  {bar(smean,10)} {smean:>3.0%}      {nm:>2}{ft:>3}  {q}")

print("\nAggregat je Typ (Ø Gesamt-Ähnlichkeit):")
for typ, rs in sorted(agg.items()):
    print(f"  {typ:<13} n={len(rs):<3} Ø {sum(rs)/len(rs):.0%}  (min {min(rs):.0%} / max {max(rs):.0%})")
allr = [r for rs in agg.values() for r in rs]
if allr:
    print(f"  {'GESAMT':<13} n={len(allr):<3} Ø {sum(allr)/len(allr):.0%}")

if data.get("uebersprungen"):
    print(f"\nÜbersprungen ({len(data['uebersprungen'])}):")
    for u in data["uebersprungen"]:
        print(f"  - {u}")

rp = os.path.join(os.path.dirname(sys.argv[1]), "report.md")
open(rp, "w").write("\n".join(report))
print(f"\nDetail-Report: {rp}")
