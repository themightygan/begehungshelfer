#!/usr/bin/env node
// Einmalige Vorbelegung von Parzelle.anrede aus dem Vornamen (2026-07-06).
// Nur EINDEUTIGE Vornamen werden gesetzt (Liste unten, gegen den echten
// Datenbestand kuratiert); Zweifelsfälle bleiben leer -> werden vor der
// Schreiben-Erstellung in der App nachgefragt. Idempotent: fasst nur
// Parzellen mit anrede = "" an. Aufruf: node scripts/anrede-vorbelegen.mjs [--fix]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIX = process.argv.includes("--fix");

const M = new Set(["Abu","Adem","Adrian","Ahmad","Albert","Albrecht","Aleksandar","Alexander","Alfred","Ali","Alim","Andreas","Attila","Bodo","Christian","Christoph","Damiano","Darko","Dejan","Dieter","Dino","Emanuele","Felix","Ferenc","Georg","Gerald","Günter","H.-Joachim","Hans","Hans-Ullrich","Holger","Hüseyin","Ibrahim","Igor","Izzet","Jan","Jannis","Jens","Johannes","Jose-Maria","Josef","Juri","Jürgen","Manuel","Marco","Marek","Mario","Markus","Martin","Matteo","Michael","Mike","Mohamad","Mussa","Nicklas","Norbert","Ohan","Oliver","Peter","Philipp","Rainer","Ralf","Rexhep","Robert","Roman","Rudolf","Sascha","Semir","Stefan","Tomasz","Vasyl","Wieslaw","Willi","Yordan","Zafer","Zekeriyya","Zeljko","Zijad"]);
const F = new Set(["Angelika","Anita","Anja","Anna","Anne","Barbara","Bärbel","Christa","Christine","Elke","Elvira","Emine","Erika","Eva","Fatma","Gabi","Georgina","Hanna","Helene","Helga","Ingrid","Irina","Jessica","Juliane","Katalin","Katharina","Katrin","Kerstin","Kristina","Laura","Luise","Malgorzata","Margarete","Maria","Marija","Melanie","Naida","Natalia","Natalija","Olga","Pasqualina","Petra","Ramona","Sabine","Sakiba","Sonja","Stefanie","Susanne","Ursula","Urte","Verena"]);
// Bewusst NICHT gesetzt (mehrdeutig/unsicher): Kay, Hilal, Dana, Enkhsaruul,
// Dores, Narinder, Jasmin — Klärung durch den Vorstand.

const parzellen = await prisma.parzelle.findMany({
  where: { anrede: "", status: { in: ["verpachtet", "neupaechter", "gekuendigt"] }, vorname: { not: "" } },
  select: { id: true, parzelleId: true, vorname: true, nachname: true },
  orderBy: { parzelleId: "asc" },
});

let herr = 0, frau = 0;
const offen = [];
for (const p of parzellen) {
  const erster = p.vorname.replace(/^Dr\.\s*/, "").trim().split(/\s+/)[0] ?? "";
  const anrede = M.has(erster) ? "herr" : F.has(erster) ? "frau" : "";
  if (!anrede) { offen.push(`${p.parzelleId}: ${p.vorname} ${p.nachname}`); continue; }
  if (FIX) await prisma.parzelle.update({ where: { id: p.id }, data: { anrede } });
  anrede === "herr" ? herr++ : frau++;
}

console.log(`${FIX ? "Gesetzt" : "Würde setzen (Dry-Run, --fix zum Schreiben)"}: ${herr}× Herr, ${frau}× Frau`);
console.log(`Offen (Zweifelsfall/unbekannt): ${offen.length}`);
for (const o of offen) console.log("  " + o);
await prisma.$disconnect();
