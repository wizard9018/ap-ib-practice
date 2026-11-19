// Imports AP Physics MC (data/<sub>-mc-raw.json + <sub>-units.json) into ap_practice (course p1/p2, topic "P1.<unit>") and uploads figures to ap-figures.
//   node --env-file=.env.local scripts/import-ap-physics.mjs ap-physics-1
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const sub = process.argv[2] ?? "ap-physics-1";
const tag = { "ap-physics-1": "p1", "ap-physics-2": "p2", "ap-macroeconomics": "ma", "ap-microeconomics": "mi" }[sub];
const D = new URL("../../data/", import.meta.url);
const raw = JSON.parse(await readFile(new URL(`${sub}-mc-raw.json`, D), "utf8"));
const topics = JSON.parse(await readFile(new URL(`${sub}-topics.json`, D), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL.trim()}/storage/v1/object/public/ap-figures/`;
const up = new Map();   // storage name -> local path
const imgMd = (p) => { const n = `${tag}/${p.replace(/^images\//, "").replace("/", "__")}`; up.set(n, p); return `![](${base}${n})`; };
const tableMd = (t) => t.map((row, i) => { const l = "| " + row.map((c) => c.markdown.replace(/\|/g, "/")).join(" | ") + " |"; return i === 0 ? l + "\n|" + row.map(() => " --- |").join("") : l; }).join("\n");

const rows = [];
for (const r of raw) {
  const code = topics[r.id]; const unit = code && code !== "0" ? +code.split(".")[0] : null;
  const choices = r.choices.map((c) => ({ label: c.label, text: [c.text, ...c.images.map(imgMd)].filter(Boolean).join("\n\n") }));
  const prompt = [r.prompt, ...r.prompt_images.map(imgMd), ...r.prompt_tables.map(tableMd)].filter((s) => s.trim()).join("\n\n");
  if (!unit || !r.answer || !prompt || choices.some((c) => !c.text)) continue;
  rows.push({ id: r.id, course: tag, unit, kind: "mc", year: r.year, number: r.number, prompt, choices, parts: [], answer: r.answer, rubric: null, topic: `${tag.toUpperCase()}:${code}`, papers: [], paper_numbers: {}, figures: null });
}
const names = [...up.keys()];
{ const { error } = await db.from("ap_practice").delete().eq("course", tag); if (error) throw new Error(error.message); }   // replace this course only
for (let i = 0; i < names.length; i += 8) {
  await Promise.all(names.slice(i, i + 8).map(async (n) => {
    const { error } = await db.storage.from("ap-figures").upload(n, await readFile(new URL(`subjects/${up.get(n)}`, D)), { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`${n}: ${error.message}`);
  }));
}
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await db.from("ap_practice").upsert(rows.slice(i, i + 100));
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
}
console.log("skipped", raw.length - rows.length, "| imported", rows.length, "| images", names.length);
