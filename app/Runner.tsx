"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import type { Answers, Attempt, Block, Choice, ExamState, Result } from "@/lib/types";
import HighlightableHTML from "./HighlightableHTML";
import Timer, { usedSeconds } from "./Timer";
import Navigator from "./Navigator";
import Calculator from "./Calculator";
import { SCORE_RANGE, mediansFor, ssatLevelOf, ssatRawScore, ssatScaledScore, type SsatSection } from "@/lib/ssat-score";

type Question = { id: string; number: number; section: string; prompt: Block[]; choices: Choice[] };
type Section = { title: string; minutes: number; calculator: boolean; directions: string[]; note: string };
export type Exam = { exam: string; sections: Record<string, Section>; questions: Question[] };

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const hms = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

// ---- content -> HTML (so the passage can be highlighted exactly like the SAT runner: it works on an HTML string)
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (t: string) =>
  t.split(/(\\\([\s\S]*?\\\))/g).map((p) => (p.startsWith("\\(") ? katex.renderToString(p.slice(2, -2), { throwOnError: false }) : esc(p))).join("");
const blocksHtml = (blocks: Block[]) =>
  blocks.map((b) =>
    b.type === "image" ? `<img src="${b.src}" alt="" class="my-3 max-w-full h-auto">`
    : b.type === "table" ? `<table class="my-3 border-collapse text-center"><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td class="border border-gray-400 px-4 py-1.5">${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<p class="my-1">${inline(b.text)}</p>`).join("");

// SSAT: the shared material (passage, graph) stays on the left; the question itself sits on the right above the answer choices.
// Imported SSAT prompts are [context image?, ...question blocks]; Elementary reading prompts are [...passage blocks, question text].
function splitSsatPrompt(examId: string, section: string, prompt: Block[]): { ctx: Block[]; stem: Block[] } {
  if (!examId.startsWith("ssat-")) return { ctx: prompt, stem: [] };
  if (examId.startsWith("ssat-elementary-")) return section === "reading" && prompt.length > 1 ? { ctx: prompt.slice(0, -1), stem: prompt.slice(-1) } : { ctx: [], stem: prompt };
  return prompt.length > 1 && prompt[0].type === "image" ? { ctx: prompt.slice(0, 1), stem: prompt.slice(1) } : { ctx: [], stem: prompt };
}

const SECTION_DIRECTIONS_EXTRA = ["The section is submitted automatically when time runs out. You cannot return to a section once it is submitted.", "Keyboard: A–E to choose an answer, left/right arrows to change question."];

type Props = {
  exam: Exam;
  attempt: Attempt;
  email: string;
  onSave: (answers: Answers, state: ExamState) => Promise<void>;
  onSubmit: () => Promise<Result>;
  onSignOut: () => void;
};

export default function Runner({ exam, attempt, email, onSave, onSubmit, onSignOut }: Props) {
  const qs = exam.questions;
  const sectionIds = Object.keys(exam.sections);
  const st0 = attempt.exam_state;
  const firstOf = (n: number) => qs.findIndex((x) => x.section === sectionIds[n]);

  const [phase, setPhase] = useState<"start" | "directions" | "test" | "review" | "between" | "submitting" | "result">("start");
  const [secIdx, setSecIdx] = useState(st0.sectionIndex);       // the section being taken; earlier sections are locked
  const [i, setI] = useState(() => firstOf(st0.sectionIndex) + st0.questionIndex);   // index into qs
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(attempt.answers).map(([k, a]) => [k, a.value])));
  const [marked, setMarked] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(attempt.answers).map(([k, a]) => [k, a.marked])));
  const [crossed, setCrossed] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(attempt.answers).map(([k, a]) => [k, a.eliminated ?? []])));
  const [eliminator, setEliminator] = useState(true);
  const [startedAt, setStartedAt] = useState(0);                // when the open section's clock started
  const [usedDone, setUsedDone] = useState(st0.usedDone);       // seconds spent in sections already submitted
  const [lastUsed, setLastUsed] = useState(0);                  // seconds the section just submitted took
  const [spent, setSpent] = useState<Record<string, number>>(st0.spent ?? {});   // seconds per question, revisits add up
  // Official / Ivy / Tivitails passages are wide pages scanned at full width, so they get more of the screen by default
  const [splitPercent, setSplitPercent] = useState(/^ssat-middle-(official|ivy|tivitails)-/.test(attempt.exam_id) ? 64 : 50);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [saveWarn, setSaveWarn] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const leavingRef = useRef(false);
  const wroteUrl = useRef(false);
  const saving = useRef(false);

  const sid = sectionIds[secIdx];
  const sec = exam.sections[sid];
  const sectionQs = useMemo(() => qs.filter((x) => x.section === sid), [qs, sid]);
  const firstIdx = firstOf(secIdx);
  const lastIdx = firstIdx + sectionQs.length - 1;
  const q = qs[i];
  const split = splitSsatPrompt(attempt.exam_id, q?.section ?? "", q?.prompt ?? []);
  const limit = sec.minutes * 60;
  const isLastSection = secIdx === sectionIds.length - 1;
  // a brand-new attempt (nothing answered, still at the first directions page)
  const fresh = st0.sectionIndex === 0 && st0.phase === "directions" && st0.usedDone === 0 && Object.keys(attempt.answers).length === 0;

  // ---- what the server stores
  const payload = () => {
    const answers: Answers = {};
    for (const x of qs) {
      const value = picked[x.id] ?? "", mk = !!marked[x.id], el = crossed[x.id] ?? [];
      if (value || mk || el.length) answers[x.id] = { value, marked: mk, eliminated: el };
    }
    const open = phase === "test" || phase === "review";
    const state: ExamState = {
      sectionIndex: secIdx, questionIndex: i - firstIdx,
      phase: phase === "submitting" ? "review" : (phase as ExamState["phase"]),
      used: open ? Math.min(limit, usedSeconds(startedAt)) : phase === "directions" ? 0 : lastUsed,
      usedDone, spent, savedAt: Date.now(),
    };
    return { answers, state };
  };
  const latest = useRef(payload);
  latest.current = payload;

  // Saves the newest state; saves never overlap (the server rejects a stale write), and a refusal is thrown to the caller.
  async function persist() {
    while (saving.current) await new Promise((r) => setTimeout(r, 80));
    saving.current = true;
    try { const p = latest.current(); await onSave(p.answers, p.state); setSaveWarn(false); } finally { saving.current = false; }
  }
  const background = () => { void persist().catch(() => setSaveWarn(true)); };

  const live = phase === "directions" || phase === "test" || phase === "review" || phase === "between";
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(background, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, phase, secIdx, i, picked, marked, crossed, usedDone, spent]);
  useEffect(() => {   // the clock is part of the saved state, so it is also saved every 5 seconds
    if (phase !== "test" && phase !== "review") return;
    const t = setInterval(background, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- section flow
  function openDirections(n: number) {
    setSecIdx(n);
    setI(firstOf(n));
    wroteUrl.current = false;
    setPhase("directions");
  }
  function startClock() {
    setStartedAt(Date.now());
    setShowCalculator(false);
    setPhase("test");
  }
  function resume() {
    setSecIdx(st0.sectionIndex);
    setI(firstOf(st0.sectionIndex) + st0.questionIndex);
    setLastUsed(st0.used);
    setStartedAt(Date.now() - st0.used * 1000);   // the clock only ran while the exam was open
    wroteUrl.current = false;
    setPhase(st0.phase);
  }
  // submitting a section (or running out of time) locks it for good
  const finishSection = useCallback(() => {
    const used = Math.min(limit, usedSeconds(startedAt));
    setLastUsed(used);
    setUsedDone((u) => u + used);
    setShowNavigator(false); setShowCalculator(false); setPendingConfirm(null);
    setPhase(isLastSection ? "submitting" : "between");
  }, [limit, startedAt, isLastSection]);

  // the last section: save the final answers, then the server grades and sends the key back
  async function submitFinal() {
    setSubmitError(null);
    try { await persist(); setResult(await onSubmit()); leavingRef.current = true; setPhase("result"); }
    catch (e) { setSubmitError((e as Error).message); }
  }
  useEffect(() => {
    if (phase === "submitting") void submitFinal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // the clock keeps running on the review page; at zero the section is submitted
  useEffect(() => {
    if (phase !== "test" && phase !== "review") return;
    const t = setInterval(() => { if (usedSeconds(startedAt) >= limit) finishSection(); }, 1000);
    return () => clearInterval(t);
  }, [phase, startedAt, limit, finishSection]);

  // closing the tab by accident asks first (a refresh resumes in place)
  useEffect(() => {
    if (phase !== "test" && phase !== "review" && phase !== "submitting") return;
    const warn = (e: BeforeUnloadEvent) => { if (leavingRef.current) return; e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  // ---- position <-> URL: every move adds a history entry, so the browser's Back button is a real "previous question".
  // Earlier sections stay locked: Back never leads into them.
  const want = phase === "review" ? `?s=${secIdx}&q=${i - firstIdx}&review=1` : `?s=${secIdx}&q=${i - firstIdx}`;
  useEffect(() => {
    if (phase !== "test" && phase !== "review") return;
    if (window.location.search !== want) window.history[wroteUrl.current ? "pushState" : "replaceState"](null, "", want);
    wroteUrl.current = true;
  }, [phase, want]);
  useEffect(() => {
    const onPop = () => {
      if (phase !== "test" && phase !== "review") return;
      const sp = new URLSearchParams(window.location.search);
      const s = Number(sp.get("s")), n = Number(sp.get("q"));
      if (s !== secIdx || !Number.isInteger(n) || n < 0 || n >= sectionQs.length) { window.history.replaceState(null, "", want); return; }
      setI(firstIdx + n);
      setPhase(sp.get("review") === "1" ? "review" : "test");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [phase, secIdx, sectionQs.length, firstIdx, want]);

  // ---- time on each question: revisits add up
  useEffect(() => {
    if (phase !== "test") return;
    const id = qs[i].id, from = Date.now();
    return () => {
      const elapsed = Math.round((Date.now() - from) / 1000);
      if (elapsed > 0) setSpent((s) => ({ ...s, [id]: (s[id] ?? 0) + elapsed }));
    };
  }, [phase, i, qs]);

  // ---- answering
  const choose = useCallback((label: string) => setPicked((p) => ({ ...p, [q.id]: p[q.id] === label ? "" : label })), [q.id]);
  const cross = (label: string) => setCrossed((c) => {
    const cur = c[q.id] ?? [];
    return { ...c, [q.id]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] };
  });
  const goNext = () => { if (i === lastIdx) setPhase("review"); else setI(i + 1); };
  const goPrev = () => { if (i > firstIdx) setI(i - 1); };

  // keyboard: A-E choose, left / right move between questions
  useEffect(() => {
    if (phase !== "test") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, .dcg-container")) return;
      const k = e.key.toUpperCase();
      if (k.length === 1 && "ABCDE".includes(k)) { if (!(crossed[q.id] ?? []).includes(k)) choose(k); }
      else if (e.key === "ArrowRight") { if (i === lastIdx) setPhase("review"); else setI(i + 1); }
      else if (e.key === "ArrowLeft" && i > firstIdx) setI(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, i, crossed, q.id, choose, firstIdx, lastIdx]);

  // ---- draggable divider between the passage and the answers
  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
  function onDividerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    setSplitPercent(Math.min(75, Math.max(25, ((e.clientX - rect.left) / rect.width) * 100)));
  }
  function onDividerUp(e: React.PointerEvent<HTMLDivElement>) { draggingRef.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }

  // ================= screens
  if (phase === "start") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold tracking-wide text-blue-700">{attempt.exam_id.startsWith("ssat-") ? "SSAT Practice" : "AP Practice"}</span>
            <span className="text-gray-400">{email} · <button onClick={onSignOut} className="underline hover:text-gray-600">Sign out</button></span>
          </div>
          <h1 className="text-2xl font-bold mt-1">{exam.exam}</h1>
          <p className="text-gray-600 mt-1">Section I · {qs.length} multiple-choice questions</p>
          <div className="mt-6 space-y-3 text-sm">
            {sectionIds.map((id) => (
              <div key={id} className="rounded-lg bg-gray-50 p-3">
                <div className="font-semibold">{exam.sections[id].title}</div>
                <div className="text-gray-500">{exam.sections[id].note}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">Each section has its own countdown and is submitted automatically when time runs out. You cannot return to an earlier section. Progress is saved to your account, so you can continue on another device.</p>
          <button onClick={fresh ? () => openDirections(0) : resume} className="mt-4 w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700">
            {fresh ? "Start" : "Resume your exam"}
          </button>
        </div>
      </main>
    );
  }

  if (phase === "directions") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-xl w-full border border-gray-200 rounded-2xl p-8 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-blue-700">{exam.exam}</p>
          <h1 className="text-2xl font-bold mt-1">{sec.title}</h1>
          <p className="text-gray-600 text-sm mt-1">{sec.note}</p>
          <h2 className="font-semibold mt-6 mb-2">Directions</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
            {[...sec.directions, ...SECTION_DIRECTIONS_EXTRA].map((d) => <li key={d}>{d}</li>)}
          </ul>
          <button onClick={startClock} className="mt-7 w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700">Start · {sec.minutes} minutes</button>
        </div>
      </main>
    );
  }

  if (phase === "between") {
    const next = exam.sections[sectionIds[secIdx + 1]];
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="max-w-lg w-full border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
          <p className="text-sm text-gray-500">{sec.title} has been submitted and can no longer be changed.</p>
          <h1 className="text-2xl font-bold mt-2">{next.title}</h1>
          <p className="text-gray-600 mt-1">{next.note}</p>
          <p className="text-xs text-gray-500 mt-4">The next page has this section's directions. The clock starts only when you press Start.</p>
          <button onClick={() => openDirections(secIdx + 1)} className="mt-6 w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700">Continue · {next.title}</button>
        </div>
      </main>
    );
  }

  if (phase === "submitting") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-10 text-center">
        <div className="max-w-sm">
          {submitError ? (
            <>
              <p className="text-red-600 mb-4">Submission failed: {submitError}</p>
              <p className="text-sm text-gray-500 mb-4">Your answers are still on this page. Please do not refresh.</p>
              <button onClick={() => void submitFinal()} className="rounded-full bg-blue-600 text-white font-semibold px-8 py-3">Retry submit</button>
            </>
          ) : (
            <p className="text-gray-600">Submitting. Please do not refresh the page…</p>
          )}
        </div>
      </main>
    );
  }

  if (phase === "result" && result) {
    const byId = new Map(result.items.map((it) => [it.id, it]));
    // SSAT: raw = right - wrong/4 per section (both Quantitative sections count as one), then the estimated scaled score
    const level = ssatLevelOf(attempt.exam_id);
    const med = mediansFor(level);
    const ssat = attempt.exam_id.startsWith("ssat-")
      ? (["Verbal", "Quantitative", "Reading"] as SsatSection[]).map((name) => {
          const items = result.items.filter((x) => (name === "Quantitative" ? x.section_id.startsWith("quant") : x.section_id === name.toLowerCase()));
          const right = items.filter((x) => x.isCorrect).length, wrong = items.filter((x) => x.selected && !x.isCorrect).length;
          const raw = ssatRawScore(right, wrong, level);
          return { name, total: items.length, right, wrong, blank: items.length - right - wrong, raw, scaled: ssatScaledScore(name, raw, level) };
        })
      : null;
    return (
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        {ssat && (
          <section className="border border-gray-200 rounded-2xl p-6 mb-8 text-center">
            <p className="text-xs font-semibold tracking-wide text-blue-700">ESTIMATED SSAT SCORE</p>
            <p className="text-5xl font-extrabold mt-1">{ssat.reduce((a, s) => a + s.scaled, 0)}<span className="text-lg text-gray-400 font-bold"> / {SCORE_RANGE[level].max}</span></p>
            <div className="grid grid-cols-3 gap-3 mt-5 text-sm">
              {ssat.map((s) => (
                <div key={s.name} className="rounded-xl bg-gray-50 p-3">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-2xl font-bold">{s.scaled}</div>
                  <div className="text-xs text-gray-500">{s.right} right · {s.wrong} wrong · {s.blank} blank</div>
                  <div className="text-xs text-gray-400">raw {Number(s.raw.toFixed(2))} of {s.total}</div>
                  {med && <div className="text-xs text-gray-500 mt-1">Median {med.grades.map((g) => `G${g} ${med.get(s.name, g)}`).join(" · ")}</div>}
                </div>
              ))}
            </div>
            {med && <p className="text-sm text-gray-600 mt-4">Median total (50th percentile): {med.grades.map((g) => `Grade ${g} ${((["Verbal", "Quantitative", "Reading"] as SsatSection[]).reduce((a, n) => a + med.get(n, g), 0))}`).join(" · ")}</p>}
            <p className="text-xs text-gray-400 mt-2">{level === "elementary" ? <>Estimate from the practice book&apos;s own conversion chart ({SCORE_RANGE[level].section} per section; third-party, not an official SSAT chart). The Elementary Level has no penalty for wrong answers, so the raw score is the number correct. A blank paper scores {ssat.reduce((a, x) => a + ssatScaledScore(x.name, 0, level), 0)} here. The SSAT publishes no percentile data for this level, so no medians are shown.</> : <>Estimate from the SSAT&apos;s published raw-to-scaled table ({SCORE_RANGE[level].section} per section). It is not an official SSAT score; the real conversion differs a little between test forms. A blank paper scores {ssat.reduce((a, x) => a + ssatScaledScore(x.name, 0, level), 0)} here because a raw score of 0 maps to {ssat.map((x) => ssatScaledScore(x.name, 0, level)).join(" / ")}. Medians are third-party figures (Ivy Global) for same-grade test takers over the past three years.</>}</p>
          </section>
        )}
        <h1 className="text-3xl font-bold text-center">{result.correct} / {result.total} correct</h1>
        <p className="text-center text-gray-500 text-sm mt-1">
          Time {mmss(usedDone)} ·{" "}
          {sectionIds.map((id) => `${exam.sections[id].title}: ${result.items.filter((x) => x.section_id === id && x.isCorrect).length}/${result.items.filter((x) => x.section_id === id).length}`).join(" · ")}
        </p>
        <div className="mt-8 space-y-5">
          {sectionIds.map((id) => qs.filter((x) => x.section === id).map((x, n) => {
            const r = byId.get(x.id)!;
            return (
              <div key={x.id} className="border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-black text-white text-xs font-semibold">{n + 1}</span>
                  <span className="text-xs text-gray-400">{exam.sections[id].title}</span>
                  <span className={r.isCorrect ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{r.isCorrect ? "Correct" : r.selected ? "Incorrect" : "Unanswered"}</span>
                  <span className="text-xs text-gray-400 ml-auto">⏱ {hms(spent[x.id] ?? 0)}</span>
                </div>
                <div className="exam-serif mb-3" dangerouslySetInnerHTML={{ __html: blocksHtml(x.prompt) }} />
                <ul className="space-y-1.5">
                  {x.choices.map((c) => (
                    <li key={c.label} className={`flex items-center gap-3 rounded-lg border-2 px-3 py-1.5 ${c.label === r.correct ? "border-green-500 bg-green-50" : c.label === r.selected ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
                      <span className="font-semibold w-5">{c.label}</span>
                      <span className="exam-serif" dangerouslySetInnerHTML={{ __html: blocksHtml(c.content) }} />
                      {c.label === r.correct && <span className="ml-auto text-xs font-semibold text-green-700">Correct answer</span>}
                      {c.label === r.selected && c.label !== r.correct && <span className="ml-auto text-xs font-semibold text-red-600">Your answer</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }))}
        </div>
        <div className="flex justify-center mt-8">
          <button onClick={() => window.location.assign(window.location.pathname)} className="rounded-full bg-blue-600 text-white font-semibold px-8 py-3 hover:bg-blue-700">Try again</button>
        </div>
      </main>
    );
  }

  if (phase === "review") {
    return (
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        <h1 className="text-3xl font-normal text-center mb-6">Check Your Work</h1>
        <p className="text-sm text-gray-700 mb-1">On test day, you won&apos;t be able to move on to the next section until you submit this one or time expires.</p>
        <p className="text-sm text-gray-700 mb-8">After you submit, you cannot return to this section.</p>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-bold text-sm">{sec.title} Questions</h2>
            <div className="flex gap-4 text-xs text-gray-500">
              <span><span className="inline-block w-3 h-3 border border-dashed border-gray-400 rounded mr-1 align-middle" />Unanswered</span>
              <span>🔖 For Review</span>
            </div>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-3">
            {sectionQs.map((x, n) => (
              <button key={x.id} onClick={() => { setI(firstIdx + n); setPhase("test"); }}
                className={`relative h-12 rounded text-sm font-semibold ${picked[x.id] ? "bg-blue-600 text-white" : "border border-dashed border-gray-400 bg-white text-blue-700"}`}>
                {n + 1}{marked[x.id] && <span className="absolute -top-1 -right-1 text-red-500 text-xs">🔖</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end items-center gap-4 mt-6">
          <span className="text-sm font-mono text-gray-500">Remaining {mmss(Math.max(0, limit - usedSeconds(startedAt)))}</span>
          <button onClick={() => {
            const unanswered = sectionQs.filter((x) => !picked[x.id]).length;
            if (unanswered > 0) { setPendingConfirm(`You have ${unanswered} unanswered question${unanswered > 1 ? "s" : ""}. ${isLastSection ? "Submit anyway?" : "Continue anyway?"} You cannot return to this section.`); return; }
            finishSection();
          }} className="bg-blue-600 text-white rounded-full px-8 py-3 font-semibold hover:bg-blue-700">
            {isLastSection ? "Submit Test" : "Next"}
          </button>
        </div>

        {pendingConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <p className="text-sm text-gray-800 mb-5">{pendingConfirm}</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setPendingConfirm(null)} className="rounded-full border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Go back</button>
                <button onClick={() => { setPendingConfirm(null); finishSection(); }} className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{isLastSection ? "Submit anyway" : "Continue anyway"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- the answering screen
  const crossedHere = crossed[q.id] ?? [];
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-4 py-2">
        <div className="text-sm font-medium text-gray-800">{exam.exam} · {sec.title}</div>
        <div className="flex items-center gap-2">
          {sec.calculator && (
            <button onClick={() => setShowCalculator((s) => !s)} className={`text-sm px-2 py-1 rounded font-medium ${showCalculator ? "text-blue-600 bg-blue-100" : "text-gray-600 hover:bg-blue-100"}`}>Calculator</button>
          )}
          <Timer key={secIdx} startedAt={startedAt} limitSeconds={limit} onExpire={finishSection} />
        </div>
      </header>
      <div className="bg-blue-900 text-white text-center text-xs font-semibold tracking-wide py-1">THIS IS A PRACTICE TEST</div>
      {saveWarn && <div className="bg-red-100 text-red-700 text-center text-xs font-semibold py-1">Progress could not be saved to the server. Retrying. Keep this page open and check your connection.</div>}

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div ref={splitRef} className="h-full flex">
          <div style={{ width: `${splitPercent}%` }} className="overflow-y-auto shrink-0">
            <div className="p-6 prose max-w-none exam-serif">
              <HighlightableHTML key={q.id} html={blocksHtml(split.ctx)} />
            </div>
          </div>
          <div
            onPointerDown={onDividerDown} onPointerMove={onDividerMove} onPointerUp={onDividerUp}
            className="w-2 shrink-0 cursor-col-resize bg-gray-100 hover:bg-blue-100 border-x border-gray-200 flex items-center justify-center touch-none"
          >
            <span className="text-gray-400 text-xs select-none">⋮</span>
          </div>
          <div style={{ width: `${100 - splitPercent}%` }} className="overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b border-dashed border-gray-300 bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-black text-white text-xs font-semibold">{i - firstIdx + 1}</span>
                <button onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))} className={`text-sm flex items-center gap-1 ${marked[q.id] ? "text-blue-600" : "text-gray-600"}`}>
                  {marked[q.id] ? "🔖 Marked for Review" : "🔖 Mark for Review"}
                </button>
              </div>
              <button onClick={() => setEliminator((m) => !m)} title="Cross out answer choices you think are wrong."
                className={`text-xs font-bold rounded px-2 py-1 ${eliminator ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>A̶B̶C̶</button>
            </div>
            <div className="p-6">
              {split.stem.length > 0 && <div className="exam-serif mb-4" dangerouslySetInnerHTML={{ __html: blocksHtml(split.stem) }} />}
              <div className="space-y-2">
                {q.choices.map((c) => {
                  const out = crossedHere.includes(c.label);
                  const on = picked[q.id] === c.label;
                  return (
                    <div key={c.label} className="flex items-center gap-2">
                      <button onClick={() => choose(c.label)} disabled={out}
                        className={`flex-1 flex items-center gap-3 border-2 rounded-lg px-3 py-1.5 text-left transition-colors ${on ? "border-blue-600 bg-blue-50" : "border-gray-300 hover:border-blue-400"} ${out ? "opacity-40 cursor-not-allowed" : ""}`}>
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 text-xs font-semibold ${on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-400 text-gray-700"}`}>{c.label}</span>
                        <span className={`exam-serif ${out ? "line-through" : ""}`} dangerouslySetInnerHTML={{ __html: blocksHtml(c.content) }} />
                      </button>
                      {eliminator && (
                        <button onClick={() => cross(c.label)} className="w-7 h-7 rounded-full border border-gray-400 text-gray-500 text-xs shrink-0 relative" title={out ? "Undo cross-out" : "Cross out this choice"}>
                          {c.label}{out && <span className="absolute left-0 right-0 top-1/2 border-t border-gray-600" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-between bg-blue-50 border-t border-blue-100 px-6 py-3">
        <button onClick={goPrev} disabled={i === firstIdx} className="text-sm font-semibold text-gray-700 disabled:opacity-30">← Back</button>
        <button onClick={() => setShowNavigator(true)} className="text-sm font-semibold bg-black text-white rounded-full px-5 py-2 hover:bg-gray-800">
          Question {i - firstIdx + 1} of {sectionQs.length} ⌄
        </button>
        <button onClick={goNext} className="text-sm font-semibold bg-blue-600 text-white rounded-full px-6 py-2 hover:bg-blue-700">Next →</button>
      </footer>

      {showNavigator && (
        <Navigator
          items={sectionQs.map((x) => ({ questionno: x.number, answered: !!picked[x.id], marked: !!marked[x.id] }))}
          currentIndex={i - firstIdx}
          onJump={(n) => setI(firstIdx + n)}
          onClose={() => setShowNavigator(false)}
          onReview={() => { setShowNavigator(false); setPhase("review"); }}
        />
      )}
      {sec.calculator && showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}
    </div>
  );
}
