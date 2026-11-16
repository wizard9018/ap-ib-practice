// Replaces the ap_practice table with data/ap-calc-practice-final.json (run mini/scripts/ap_practice.sql first).
//   node --env-file=.env.local scripts/import-ap-practice.mjs
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const rows = JSON.parse(await readFile(new URL("../../data/ap-calc-practice-final.json", import.meta.url), "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
{ const { error } = await db.from("ap_practice").select("papers,paper_numbers").limit(1); if (error) throw new Error(`run the ALTER statements in ap_practice.sql first (${error.message})`); }
// one merged question bank: replace what is there so questions merged away between AB and BC do not linger
{ const { error } = await db.from("ap_practice").delete().neq("id", ""); if (error) throw new Error(`${error.code ?? ""} ${error.message}`); }
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("ap_practice").upsert(rows.slice(i, i + 200));
  if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
}
const { count } = await db.from("ap_practice").select("id", { count: "exact", head: true });
console.log("uploaded", rows.length, "| rows in table", count);
