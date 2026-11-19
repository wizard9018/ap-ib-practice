// Imports Macro/Micro free-response questions (data/<sub>-frq-raw.json + <sub>-frq-topics.json) into ap_practice (kind "fr") and uploads figures to ap-figures.
//   node --env-file=.env.local scripts/import-ap-frq.mjs ap-macroeconomics
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const sub = process.argv[2];
const tag = { "ap-macroeconomics": "ma", "ap-microeconomics": "mi" }[sub];
const D = new URL("../../data/", import.meta.url);
const raw = JSON.parse(await readFile(new URL(`${sub}-frq-raw.json`, D), "utf8"));
const topics = JSON.parse(await readFile(new URL(`${sub}-frq-topics.json`, D), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL.trim()}/storage/v1/object/public/ap-figures/`;
const up = new Map();
const withImgs = (s) => s.replace(/@@IMG:([^@]+)@@/g, (_, p) => { const n = `${tag}/${p.replace(/^images\//, "").replace("/", "__")}`; up.set(n, p); return `\n\n![](${base}${n})\n\n`; });

const rows = [];
for (const r of raw) {
  const code = topics[r.id];
  if (!code || code === "0") continue;
  rows.push({ id: r.id, course: tag, unit: +code.split(".")[0], kind: "fr", year: r.year, number: r.form === "A" ? r.number : `${r.number} (${r.form})`, prompt: withImgs(r.prompt), choices: [], parts: [], answer: null, rubric: r.rubric ? withImgs(r.rubric) : null, topic: `${tag.toUpperCase()}:${code}`, papers: [], paper_numbers: {}, figures: null });
}
const names = [...up.keys()];
for (let i = 0; i < names.length; i += 8) {
  await Promise.all(names.slice(i, i + 8).map(async (n) => {
    const { error } = await db.storage.from("ap-figures").upload(n, await readFile(new URL(`subjects/${up.get(n)}`, D)), { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`${n}: ${error.message}`);
  }));
}
{ const { error } = await db.from("ap_practice").delete().eq("course", tag).eq("kind", "fr"); if (error) throw new Error(error.message); }
for (let i = 0; i < rows.length; i += 50) {
  const { error } = await db.from("ap_practice").upsert(rows.slice(i, i + 50));
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
}
console.log("imported", rows.length, "| images", names.length, "| without rubric", rows.filter((r) => !r.rubric).length);
