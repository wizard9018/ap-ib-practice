// Usage: node scripts/import-ib-choices.mjs <json file> [--all]   (default: skips items the checker flagged)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = process.argv.includes("--all");
const rows = JSON.parse(readFileSync(process.argv[2], "utf8")).filter((r) => all || r.check === "ok").map(({ check, ...r }) => ({ ...r, check_note: check }));
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("ib_choices").upsert(rows.slice(i, i + 200), { onConflict: "ref,part" });
  if (error) { console.error(error.message); process.exit(1); }
}
console.log(`imported ${rows.length} items`);
