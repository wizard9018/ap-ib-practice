// Upserts the number-changed question variants into ap_variants (run mini/scripts/ap_practice.sql first).
//   node --env-file=.env.local scripts/import-ap-variants.mjs [file in ../data, default variants-pilot.json]
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2] ?? "variants-pilot.json";
const rows = JSON.parse(await readFile(new URL(`../../data/${file}`, import.meta.url), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const probe = await db.from("ap_variants").select("base_id").limit(1);
if (probe.error) throw new Error(`run the ap_variants part of ap_practice.sql first (${probe.error.message})`);
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("ap_variants").upsert(rows.slice(i, i + 200));
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
}
const { count } = await db.from("ap_variants").select("base_id", { count: "exact", head: true });
console.log("upserted", rows.length, "| rows in ap_variants", count);
