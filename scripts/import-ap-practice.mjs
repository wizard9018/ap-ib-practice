// Replaces the ap_practice table with data/ap-calc-practice-final.json + data/ap-calc-practice-figs.json (figure questions; images go to the public ap-figures bucket).
// Run mini/scripts/ap_practice.sql first.
//   node --env-file=.env.local scripts/import-ap-practice.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const readJson = async (f) => JSON.parse(await readFile(new URL(`../../data/${f}`, import.meta.url), "utf8"));
const rows = [...(await readJson("ap-calc-practice-final.json")), ...(await readJson("ap-calc-practice-figs.json"))].filter((r) => r.unit != null); // a precalculus-only figure question has no unit
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
{ const { error } = await db.from("ap_practice").select("papers,paper_numbers,figures").limit(1); if (error) throw new Error(`run the ALTER statements in ap_practice.sql first (${error.message})`); }
// figure images -> public bucket, rows get their public urls
const BUCKET = "ap-figures", base = `${process.env.NEXT_PUBLIC_SUPABASE_URL.trim()}/storage/v1/object/public/${BUCKET}/`;
{ const { error } = await db.storage.createBucket(BUCKET, { public: true }); if (error && !/already exists/i.test(error.message)) throw new Error(error.message); }
const names = [...new Set(rows.flatMap((r) => (r.figures ? [...r.figures.p, ...Object.values(r.figures.c)] : [])))];
for (let i = 0; i < names.length; i += 8) {
  await Promise.all(names.slice(i, i + 8).map(async (n) => {
    const { error } = await db.storage.from(BUCKET).upload(n, await readFile(new URL(`../../data/figout/${n}`, import.meta.url)), { contentType: "image/png", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`${n}: ${error.message}`);
  }));
}
for (const r of rows) if (r.figures) r.figures = { p: r.figures.p.map((n) => base + n), c: Object.fromEntries(Object.entries(r.figures.c).map(([k, n]) => [k, base + n])) };
console.log("images uploaded", names.length);
// one merged question bank: replace what is there so questions merged away between AB and BC do not linger
{ const { error } = await db.from("ap_practice").delete().neq("id", ""); if (error) throw new Error(`${error.code ?? ""} ${error.message}`); }
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("ap_practice").upsert(rows.slice(i, i + 200));
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
}
const { count } = await db.from("ap_practice").select("id", { count: "exact", head: true });
console.log("uploaded", rows.length, "| rows in table", count);
