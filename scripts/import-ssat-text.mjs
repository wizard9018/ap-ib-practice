// Imports text-based SSAT practice tests (no scanned images) into the AP Supabase project.
//   node --env-file=.env.local scripts/import-ssat-text.mjs <exams.json>
// exams.json: [{ id, subject, sections: [{ id, title, minutes, note, directions, questions: [{ no, answer, prompt: Block[], choices: [{ label, content: Block[] }] }] }] }]
// The exam stays unpublished so the older site sharing this project does not list it.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const check = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code ?? ""} ${r.error.message}`); };

const exams = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const ex of exams) {
  const sections = ex.sections.map((s) => ({ id: s.id, type: "multiple_choice", time_minutes: s.minutes, calculator: false, expected_questions: s.questions.length, title: s.title, note: s.note, directions: s.directions }));
  check(await db.from("ap_exams").upsert({ id: ex.id, subject: ex.subject, year: 0, sections, published: false }), "exam");
  const rows = [], keys = [];
  let n = 0;
  for (const s of ex.sections) for (const q of s.questions) {
    if (!/^[A-E]$/.test(q.answer ?? "") || q.choices.length !== 5) throw new Error(`${ex.id} ${s.id} Q${q.no}: bad answer or choices`);
    n++;
    const id = `${ex.id}-${s.id}-${q.no}`;
    rows.push({ id, exam_id: ex.id, exam_order: n, section_id: s.id, content: { id, number: q.no, exam_order: n, section_id: s.id, prompt: q.prompt, choices: q.choices } });
    keys.push({ question_id: id, content: { correct_choice: q.answer } });
  }
  check(await db.from("ap_questions").upsert(rows), "questions");
  check(await db.from("ap_answer_keys").upsert(keys), "keys");
  const { count, error } = await db.from("ap_questions").select("id", { count: "exact", head: true }).eq("exam_id", ex.id);
  if (error || count !== rows.length) throw new Error("read-back count mismatch");
  console.log(`${ex.id}: ${count} questions, sections ${sections.map((x) => `${x.id}(${x.expected_questions})`).join(" ")}`);
}
