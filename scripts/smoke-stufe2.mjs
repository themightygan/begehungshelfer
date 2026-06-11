// Smoke-Test Stufe 2 (Offline-Workspace: Snapshot + Op-Sync) gegen :3100.
// Legt eine Wegwerf-Runde an, prüft Snapshot-Shape, Op-Idempotenz, uid-Foto,
// behobenToggle und 410-Semantik; räumt danach auf.
// Aufruf: node scripts/smoke-stufe2.mjs
import { sealData } from "iron-session";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const prisma = new PrismaClient();

let fehler = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fehler++;
}

const anlage = await prisma.anlage.findUniqueOrThrow({ where: { kuerzel: "K" } });
const runde = await prisma.begehungsrunde.create({
  data: {
    anlageId: anlage.id,
    datum: new Date(),
    bezeichnung: "SMOKE2-TEST",
    status: "offen",
  },
});
const rundeAlt = await prisma.begehungsrunde.create({
  data: {
    anlageId: anlage.id,
    datum: new Date(),
    bezeichnung: "SMOKE2-TEST",
    status: "abgeschlossen",
    abgeschlossenAm: new Date(Date.now() - 72 * 3600 * 1000),
  },
});

// Session-Cookie MIT aktiver Runde (Snapshot-Route liest sie aus der Session).
const cookie = `begehung_session=${await sealData(
  { loggedIn: true, rundeId: runde.id },
  { password: env.SESSION_SECRET }
)}`;

async function sync(op, extra = {}) {
  return fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ rundeId: runde.id, parzelleId: "K1", op, ...extra }),
    redirect: "manual",
  });
}

try {
  // 1) Snapshot: Shape + Inhalte
  const sr = await fetch(`${BASE}/api/begehung/snapshot`, { headers: { cookie } });
  const snap = sr.ok ? await sr.json() : null;
  check(
    "Snapshot: 200 + Runde + Katalog + 72 Parzellen",
    sr.status === 200 &&
      snap?.runde?.id === runde.id &&
      snap?.katalog?.length >= 20 &&
      snap?.parzellen?.length === 72,
    `status ${sr.status}, katalog ${snap?.katalog?.length}, parzellen ${snap?.parzellen?.length}`
  );
  const k1 = snap?.parzellen?.find((p) => p.parzelleId === "K1");
  check(
    "Snapshot: K1 mit Vorjahr-Feldern",
    !!k1 && "vorjahr" in k1 && "offeneFruehere" in k1 && "messHistorie" in k1,
    JSON.stringify({ vorjahr: !!k1?.vorjahr, offene: k1?.offeneFruehere?.length })
  );

  // 2) mangelUpsert: anlegen, idempotent wiederholen, ändern
  const uid = randomUUID();
  const op1 = { art: "mangelUpsert", uid, katalogId: null, bereich: "Sonstiges", punkt: "Testpunkt", notiz: "Notiz A", frist: "2026-07-01" };
  const r1 = await sync(op1);
  const r2 = await sync(op1); // Wiederholung (Netz-Retry-Simulation)
  const r3 = await sync({ ...op1, notiz: "Notiz B" }); // Änderung
  const m = await prisma.mangel.findUnique({ where: { uid } });
  const anz = await prisma.mangel.count({ where: { befund: { rundeId: runde.id } } });
  check(
    "mangelUpsert idempotent + Update",
    r1.status === 200 && r2.status === 200 && r3.status === 200 && anz === 1 && m?.notiz === "Notiz B",
    `count ${anz}, notiz ${JSON.stringify(m?.notiz)}`
  );

  // 3) Foto mit mangelUid (offline angelegter Mangel)
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append("rundeId", String(runde.id));
  fd.append("parzelleId", "K1");
  fd.append("kontext", "mangel");
  fd.append("mangelUid", uid);
  fd.append("foto", new Blob([jpeg], { type: "image/jpeg" }), "foto");
  const fr = await fetch(`${BASE}/api/foto`, { method: "POST", body: fd, headers: { cookie } });
  const fj = fr.ok ? await fr.json() : {};
  const fdb = fj.id ? await prisma.foto.findUnique({ where: { id: fj.id } }) : null;
  check(
    "Foto über mangelUid zugeordnet",
    fr.status === 200 && fdb?.mangelId === m?.id && fj.kontext === "mangel",
    `status ${fr.status}, mangelId ${fdb?.mangelId} vs ${m?.id}`
  );

  // 4) beetUpsert + befund + kompensation
  const beetUid = randomUUID();
  const b1 = await sync({ art: "beetUpsert", uid: beetUid, bezeichnung: "Beet T", flaecheM2: 12.5 });
  const b2 = await sync({ art: "befund", stufe: "hinweis", notiz: "Befund-Notiz", gutGemacht: true, plakettenNotiz: "Top" });
  const b3 = await sync({ art: "kompensation", obstAnzahl: 3, obstFlaecheM2: 30, beerenAnzahl: 0, beerenFlaecheM2: 0, notiz: "K", ausreichend: true });
  const befund = await prisma.befund.findFirst({ where: { rundeId: runde.id }, include: { beete: true } });
  check(
    "beetUpsert + befund + kompensation angewandt",
    b1.status === 200 && b2.status === 200 && b3.status === 200 &&
      befund?.beete.some((x) => x.uid === beetUid && x.flaecheM2 === 12.5) &&
      befund?.stufe === "hinweis" && befund?.gutGemacht === true &&
      befund?.kompObstAnzahl === 3 && befund?.kompensationAusreichend === true,
    `stufe ${befund?.stufe}, beete ${befund?.beete.length}`
  );

  // 5) mangelLoeschen: idempotent, Foto fällt mit (Cascade)
  const d1 = await sync({ art: "mangelLoeschen", uid });
  const d2 = await sync({ art: "mangelLoeschen", uid }); // Wiederholung
  const mWeg = await prisma.mangel.findUnique({ where: { uid } });
  const fotoWeg = fj.id ? await prisma.foto.findUnique({ where: { id: fj.id } }) : null;
  check(
    "mangelLoeschen idempotent + Cascade-Foto",
    d1.status === 200 && d2.status === 200 && !mWeg && !fotoWeg,
    `mangel ${!!mWeg}, foto ${!!fotoWeg}`
  );

  // 6) behobenToggle auf Mangel einer ALTEN (abgeschlossenen) Runde — erlaubt
  const altBefund = await prisma.befund.create({
    data: {
      rundeId: rundeAlt.id,
      parzelleId: k1.id,
      snapParzelleId: "K1",
    },
  });
  const altMangel = await prisma.mangel.create({
    data: { befundId: altBefund.id, bereich: "Garten", punkt: "Alt-Mangel" },
  });
  const altUid = (await prisma.mangel.findUnique({ where: { id: altMangel.id } })).uid;
  const t1 = await sync({ art: "behobenToggle", uid: altUid, behoben: true });
  const tDb = await prisma.mangel.findUnique({ where: { id: altMangel.id } });
  const t2 = await sync({ art: "behobenToggle", uid: altUid, behoben: false });
  const tDb2 = await prisma.mangel.findUnique({ where: { id: altMangel.id } });
  check(
    "behobenToggle (alte Runde, absolut, beide Richtungen)",
    t1.status === 200 && tDb?.status === "behoben" && !!tDb?.behobenAm &&
      t2.status === 200 && tDb2?.status === "offen" && !tDb2?.behobenAm,
    `nach true: ${tDb?.status}, nach false: ${tDb2?.status}`
  );

  // 7) Op in abgeschlossene Runde -> angenommen (editierbare Historie,
  //    Policy 2026-06-11); Op in GELÖSCHTE Runde -> 410.
  const g1 = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      rundeId: rundeAlt.id,
      parzelleId: "K1",
      op: { art: "befund", stufe: "ok", notiz: "", gutGemacht: false, plakettenNotiz: "" },
    }),
  });
  const g2 = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      rundeId: 999999,
      parzelleId: "K1",
      op: { art: "befund", stufe: "ok", notiz: "", gutGemacht: false, plakettenNotiz: "" },
    }),
  });
  check("Op: abgeschlossen -> 200, gelöscht -> 410", g1.status === 200 && g2.status === 410, `status ${g1.status}/${g2.status}`);

  // 8) fotoLoeschen-Op (offene Runde)
  const fd2 = new FormData();
  fd2.append("rundeId", String(runde.id));
  fd2.append("parzelleId", "K1");
  fd2.append("foto", new Blob([jpeg], { type: "image/jpeg" }), "foto");
  const fr2 = await fetch(`${BASE}/api/foto`, { method: "POST", body: fd2, headers: { cookie } });
  const fj2 = await fr2.json();
  const l1 = await sync({ art: "fotoLoeschen", fotoId: fj2.id });
  const l2 = await sync({ art: "fotoLoeschen", fotoId: fj2.id }); // idempotent
  const fWeg = await prisma.foto.findUnique({ where: { id: fj2.id } });
  check("fotoLoeschen idempotent", l1.status === 200 && l2.status === 200 && !fWeg, `status ${l1.status}/${l2.status}`);
} finally {
  await prisma.begehungsrunde.deleteMany({ where: { bezeichnung: "SMOKE2-TEST" } });
  await prisma.$disconnect();
}

console.log(fehler === 0 ? "\nAlle Stufe-2-Tests bestanden." : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
