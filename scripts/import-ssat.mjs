// Imports SSAT practice tests (each question, reading passage and chart is a PNG cut from the scanned book) into the AP Supabase project.
//   node --env-file=.env.local scripts/import-ssat.mjs <manifest.json>
// Manifest: [{ "dir": "C:/.../build/t10", "id": "ssat-upper-mcgraw-hill-1", "subject": "SSAT Upper Level: McGraw-Hill Practice Test 1" }]
// dir holds questions.json (section, sectionName, no, answer, img, ctx) and the PNGs it references.
// Images go to the public ssat-images bucket; the exam stays unpublished so the older site sharing this project does not list it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.trim();
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
const check = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code ?? ""} ${r.error.message}`); };
const BUCKET = "ssat-images";
{ const { error } = await db.storage.createBucket(BUCKET, { public: true }); if (error && !/already exists/i.test(error.message)) throw new Error(error.message); }

// section kind -> id, title, minutes (Upper Level: Verbal 30, Quantitative 30, Reading 40)
const KINDS = {
  Verbal: { id: "verbal", title: "Verbal", minutes: 30, note: "60 questions · 30 minutes (synonyms and analogies)" },
  "Quantitative 1": { id: "quant1", title: "Quantitative 1", minutes: 30, note: "25 questions · 30 minutes · no calculator" },
  "Quantitative 2": { id: "quant2", title: "Quantitative 2", minutes: 30, note: "25 questions · 30 minutes · no calculator" },
  Reading: { id: "reading", title: "Reading", minutes: 40, note: "40 questions · 40 minutes" },
};
const DIRECTIONS = {
  verbal: ["Questions 1-30 are synonyms: select the word or phrase that means most nearly the same as the word in capital letters. Questions 31-60 are analogies: select the answer choice that best completes the relationship.", "A correct answer earns 1 point, a wrong answer loses 1/4 point and a blank earns 0."],
  quant1: ["Each question has five choices; choose the best answer. Work out answers in the margins; no calculator is allowed.", "A correct answer earns 1 point, a wrong answer loses 1/4 point and a blank earns 0."],
  quant2: ["Each question has five choices; choose the best answer. Work out answers in the margins; no calculator is allowed.", "A correct answer earns 1 point, a wrong answer loses 1/4 point and a blank earns 0."],
  reading: ["Read each passage and choose the best answer to the questions about it.", "A correct answer earns 1 point, a wrong answer loses 1/4 point and a blank earns 0."],
};

const manifest = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const m of manifest) {
  const recs = JSON.parse(await readFile(path.join(m.dir, "questions.json"), "utf8")).filter((r) => !r._info);
  const problems = recs.filter((r) => !r.img || !/^[A-E]$/.test(r.answer ?? "")).map((r) => `section ${r.section} Q${r.no}`);
  if (problems.length) throw new Error(`${m.id}: bad records ${problems.join(", ")}`);
  const order = [...new Set(recs.map((r) => r.section))].sort((a, b) => a - b);
  const kindOf = (s) => KINDS[recs.find((r) => r.section === s).sectionName];

  // choices.json (opts2.py): the question image split into a stem image and per-option text / crops; questions missing there keep the whole image
  const split = JSON.parse(await readFile(path.join(m.dir, "choices.json"), "utf8").catch(() => "{}"));
  const splitOf = (r) => split[r.img.replace(/\.png$/, "")];
  const files = new Set(recs.flatMap((r) => {
    const sp = splitOf(r);
    return [sp ? sp.stem : r.img, r.ctx, ...(sp ? sp.choices.map((c) => c.img) : [])];
  }).filter(Boolean));
  const urlOf = new Map();
  for (const f of files) {
    const dest = `${m.id}/${f}`;
    const up = await db.storage.from(BUCKET).upload(dest, await readFile(path.join(m.dir, f)), { contentType: "image/png", upsert: true, cacheControl: "31536000" });
    if (up.error) throw new Error(`upload ${dest}: ${up.error.message}`);
    urlOf.set(f, `${URL_}/storage/v1/object/public/${BUCKET}/${dest}`);
  }

  const sections = order.map((s) => {
    const k = kindOf(s);
    return { id: k.id, type: "multiple_choice", time_minutes: k.minutes, calculator: false, expected_questions: recs.filter((r) => r.section === s).length, title: k.title, note: k.note, directions: DIRECTIONS[k.id] };
  });
  check(await db.from("ap_exams").upsert({ id: m.id, subject: m.subject, year: 0, sections, published: false }), "exam");

  const rows = [], keys = [];
  let n = 0;
  for (const s of order) for (const r of recs.filter((x) => x.section === s)) {
    n++;
    const k = kindOf(s), id = `${m.id}-${k.id}-${r.no}`;
    const sp = splitOf(r);
    // Verbal: questions 1-30 are synonyms, 31-60 analogies; each gets its own instruction line above the stem
    const hint = k.id === "verbal" ? [{ type: "text", text: r.no <= 30 ? "Select the word or phrase that means most nearly the same as the word in capital letters." : "Select the answer choice that best completes the meaning of the sentence." }] : [];
    const stem = sp?.stemText ? { type: "text", text: sp.stemText } : { type: "image", src: urlOf.get(sp ? sp.stem : r.img) };
    const prompt = [...(r.ctx ? [{ type: "image", src: urlOf.get(r.ctx) }] : []), ...hint, stem];
    const choices = sp
      ? sp.choices.map((c) => ({ label: c.label, content: [c.text !== undefined ? { type: "text", text: c.text } : { type: "image", src: urlOf.get(c.img) }] }))
      : "ABCDE".split("").map((label) => ({ label, content: [] }));
    rows.push({ id, exam_id: m.id, exam_order: n, section_id: k.id, content: { id, number: r.no, exam_order: n, section_id: k.id, prompt, choices } });
    keys.push({ question_id: id, content: { correct_choice: r.answer } });
  }
  check(await db.from("ap_questions").upsert(rows), "questions");
  check(await db.from("ap_answer_keys").upsert(keys), "keys");
  const { count, error } = await db.from("ap_questions").select("id", { count: "exact", head: true }).eq("exam_id", m.id);
  if (error || count !== rows.length) throw new Error("read-back count mismatch");
  console.log(`${m.id}: ${count} questions (${Object.keys(split).length} with options split out), ${files.size} images, sections ${sections.map((x) => `${x.id}(${x.expected_questions})`).join(" ")}`);
}
