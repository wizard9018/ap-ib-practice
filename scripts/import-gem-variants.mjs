// Uploads Gemini figure variants (data/gemvar + data/_gem_ok.json) to ap-figures and upserts ap_variants.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const D = new URL("../../data/", import.meta.url);
const ok = JSON.parse(await readFile(new URL("_gem_ok.json", D), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const rows = [];
for (const id of ok) {
  const j = JSON.parse(await readFile(new URL(`gemvar/${id}.json`, D), "utf8"));
  const png = await readFile(new URL(`gemvar/${id}.png`, D));
  const path = `${id}__v.png`;
  const up = await db.storage.from("ap-figures").upload(path, png, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error(`${id}: ${up.error.message}`);
  const url = db.storage.from("ap-figures").getPublicUrl(path).data.publicUrl;
  rows.push({ base_id: id, prompt: j.prompt, choices: j.choices, answer: j.answer, figures: { p: [url], c: {} } });
}
for (let i = 0; i < rows.length; i += 50) {
  const { error } = await db.from("ap_variants").upsert(rows.slice(i, i + 50));
  if (error) throw new Error(error.message);
}
const { count } = await db.from("ap_variants").select("base_id", { count: "exact", head: true });
console.log("upserted", rows.length, "| rows in ap_variants", count);
