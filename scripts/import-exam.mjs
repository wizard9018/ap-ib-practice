// Imports the 2008 Calculus AB multiple-choice exam into the AP Supabase project.
//   node --env-file=.env.local scripts/import-exam.mjs
// The exam stays unpublished: the mini site reads it with the service role, and the older site sharing this project does not list it.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const data = JSON.parse(await readFile(new URL("../data/questions.json", import.meta.url), "utf8"));
const id = "calculus-ab-2008";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const check = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code ?? ""} ${r.error.message}`); };

const sections = Object.entries(data.sections).map(([sid, s]) => ({
  id: sid, type: "multiple_choice", time_minutes: s.minutes, calculator: s.calculator,
  expected_questions: data.questions.filter((q) => q.section === sid).length, title: s.title, note: s.note, directions: s.directions,
}));
check(await db.from("ap_exams").upsert({ id, subject: "AP Calculus AB", year: 2008, sections, published: false }), "exam");

const questions = data.questions.map((q, n) => ({
  id: q.id, exam_id: id, exam_order: n + 1, section_id: q.section,
  content: { id: q.id, number: q.number, exam_order: n + 1, section_id: q.section, prompt: q.prompt, choices: q.choices },
}));
check(await db.from("ap_questions").upsert(questions), "questions");
check(await db.from("ap_answer_keys").upsert(data.questions.map((q) => ({ question_id: q.id, content: { correct_choice: q.correct } }))), "keys");

const { count, error } = await db.from("ap_questions").select("id", { count: "exact", head: true }).eq("exam_id", id);
if (error || count !== data.questions.length) throw new Error("read-back count mismatch");
console.log(`Imported ${count} questions of ${id}; keys are server-only.`);
