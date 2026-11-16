"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/browser";
import type { Mark } from "@/lib/ib";
import { Md, MdMath } from "./Md";
import Navigator from "./Navigator";
import { TOPICS } from "./apTopics";

// College Board CED units of AP Calculus (BC adds 9 and 10)
const UNITS: Record<number, string> = {
  1: "Limits and Continuity", 2: "Differentiation: Definition and Fundamental Properties", 3: "Differentiation: Composite, Implicit, and Inverse Functions",
  4: "Contextual Applications of Differentiation", 5: "Analytical Applications of Differentiation", 6: "Integration and Accumulation of Change",
  7: "Differential Equations", 8: "Applications of Integration",
  9: "Parametric Equations, Polar Coordinates, and Vector-Valued Functions", 10: "Infinite Sequences and Series",
};
type Course = "ab" | "bc";
const unitsOf = (c: Course) => Object.entries(UNITS).filter(([u]) => c === "bc" || +u <= 8);
const KINDS = [["all", "All"], ["mc", "MC"], ["fr", "FR"]] as const;
type Item = { label: string; text: string };
type Brief = { id: string; topic: string | null; kind: "mc" | "fr"; papers: string[] };
type Row = Brief & { year: number | null; number: string; prompt: string; choices: Item[]; parts: Item[]; answer: string | null; rubric: string | null; paper_numbers: Record<string, number> };
type Source = { title: string; label: string; topics?: string[]; paper?: string };
const TOPIC_ORDER = Object.keys(TOPICS);
const topicsOfUnit = (u: string, c: Course) => TOPIC_ORDER.filter((t) => t.split(".")[0] === u && (c === "bc" || !TOPICS[t].bcOnly));
type Done = Record<string, Mark>;
const KEY = "ap-calc-done-v2";
const readDone = (): Done => { try { return JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem("ap-calc-ab-done-v1") ?? "{}"); } catch { return {}; } };
const stripLabel = (t: string) => t.replace(/^\(?[A-E][).]\s*/, "");

// the lists need only counts; full rows are fetched when a practice set is opened
async function loadBriefs(): Promise<Brief[]> {
  const { data, error } = await supabase.from("ap_practice").select("id,topic,kind,papers").range(0, 4999);
  if (error || !data) throw new Error("Could not load AP Calculus questions.");
  return data as Brief[];
}
async function loadRows(src: Source): Promise<Row[]> {
  const q = supabase.from("ap_practice").select("id,topic,kind,papers,paper_numbers,year,number,prompt,choices,parts,answer,rubric");
  const { data, error } = await (src.paper ? q.contains("papers", [src.paper]) : q.in("topic", src.topics ?? [])).range(0, 4999);
  if (error || !data) throw new Error("Could not load these questions.");
  const rows = data as Row[];
  const p = src.paper;
  rows.sort(p ? (x, y) => (x.paper_numbers[p] ?? 0) - (y.paper_numbers[p] ?? 0)
    : (x, y) => TOPIC_ORDER.indexOf(x.topic ?? "") - TOPIC_ORDER.indexOf(y.topic ?? "") || (y.year ?? 0) - (x.year ?? 0) || x.id.localeCompare(y.id));
  return rows;
}

// the passage side only changes with the question, not while the divider is dragged
const Prompt = memo(function Prompt({ q }: { q: Row }) {
  return (
    <div className="p-6 max-w-none exam-serif">
      <p className="text-xs text-gray-400 mb-2">{q.kind === "mc" ? "Multiple choice" : "Free response"}{q.year ? ` · ${q.year}` : ""}{q.number ? ` · Question ${q.number}` : ""}{q.topic && TOPICS[q.topic] ? ` · ${q.topic} ${TOPICS[q.topic].name}` : ""}</p>
      <Md>{q.prompt}</Md>
      {q.kind === "fr" && q.parts.map((p) => <div key={p.label} className="mt-2"><strong>({p.label})</strong> <Md>{p.text}</Md></div>)}
    </div>
  );
});

export default function ApPractice({ onBack, onExam }: { onBack: () => void; onExam: () => void }) {
  const [course, setCourse] = useState<Course>("ab");
  return <Practice key={course} course={course} onCourse={setCourse} onBack={onBack} onExam={onExam} />;
}

function Practice({ course, onCourse, onBack, onExam }: { course: Course; onCourse: (c: Course) => void; onBack: () => void; onExam: () => void }) {
  const COURSE = course.toUpperCase();
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"topics" | "papers">("topics");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [src, setSrc] = useState<Source | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kind, setKind] = useState<"all" | "mc" | "fr">("all");
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Done>({});
  const [doneLoaded, setDoneLoaded] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [crossed, setCrossed] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [eliminator, setEliminator] = useState(true);
  const [showNav, setShowNav] = useState(false);
  const [split, setSplit] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDone(readDone()); setDoneLoaded(true); loadBriefs().then(setBriefs).catch((e: Error) => setError(e.message)); }, []);
  // one write per committed change (not inside the state updater)
  useEffect(() => { if (doneLoaded) try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* private mode: progress just isn't kept */ } }, [done, doneLoaded]);

  // per-topic counts (BC-only topics are hidden from AB) and the list of past papers of this course
  const stats = useMemo(() => {
    const m: Record<string, { mc: number; fr: number; fin: number }> = {};
    for (const r of briefs ?? []) if (r.topic && (course === "bc" || !TOPICS[r.topic]?.bcOnly)) {
      const t = (m[r.topic] ??= { mc: 0, fr: 0, fin: 0 }); t[r.kind]++; if (done[r.id]) t.fin++;
    }
    return m;
  }, [briefs, done, course]);
  const papers = useMemo(() => {
    const m: Record<string, { n: number; fin: number }> = {};
    for (const r of briefs ?? []) for (const p of r.papers ?? []) if (p.startsWith(course + "-")) { const e = (m[p] ??= { n: 0, fin: 0 }); e.n++; if (done[r.id]) e.fin++; }
    return Object.entries(m).sort((x, y) => +y[0].slice(3) - +x[0].slice(3));
  }, [briefs, done, course]);
  const selCount = useMemo(() => [...sel].reduce((n, t) => n + (stats[t] ? stats[t].mc + stats[t].fr : 0), 0), [sel, stats]);
  const shown = useMemo(() => (rows ?? []).filter((r) => kind === "all" || r.kind === kind), [rows, kind]);
  const q = shown[idx];
  const chosen = q ? picks[q.id] : undefined;

  // a result (c/w) is never downgraded to "answer seen"
  const mark = (id: string, m: Mark) => setDone((cur) => (m === 1 && (cur[id] === "c" || cur[id] === "w") ? cur : { ...cur, [id]: m }));
  const go = (n: number) => setIdx(Math.max(0, Math.min(shown.length - 1, n)));
  const choose = (r: Row, L: string) => { setPicks((p) => ({ ...p, [r.id]: L })); mark(r.id, r.answer ? (L === r.answer ? "c" : "w") : 1); };
  const cross = (id: string, L: string) => setCrossed((c) => { const cur = c[id] ?? []; return { ...c, [id]: cur.includes(L) ? cur.filter((x) => x !== L) : [...cur, L] }; });
  const open = (s: Source) => { setSrc(s); setRows(null); setIdx(0); setKind("all"); loadRows(s).then(setRows).catch((e: Error) => setError(e.message)); };
  const toggle = (codes: string[], on: boolean) => setSel((cur) => { const n = new Set(cur); for (const c of codes) { if (on) n.add(c); else n.delete(c); } return n; });
  const onMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !splitRef.current) return;
    const r = splitRef.current.getBoundingClientRect();
    setSplit(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)));
  };

  // keyboard like the exam: A-E choose, arrows move (listener bound once, reads the latest state from a ref)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (src === null || !q || (e.target instanceof HTMLElement && e.target.closest("input,textarea"))) return;
    const L = e.key.toUpperCase();
    if (e.key === "ArrowRight") go(idx + 1); else if (e.key === "ArrowLeft") go(idx - 1);
    else if (q.kind === "mc" && !chosen && q.choices.some((c) => c.label === L)) choose(q, L);
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);

  const shell = (children: React.ReactNode) => (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="max-w-2xl w-full border border-gray-200 rounded-2xl p-8 shadow-sm">{children}</div>
    </main>
  );

  if (error) return shell(<p className="text-red-600">{error}</p>);
  if (!briefs) return <main className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</main>;

  // ---- start page: practice by topic / mock exams (same card style as the exam start page)
  if (src === null) return shell(
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide text-blue-700">AP Practice</span>
        <button onClick={onBack} className="text-gray-400 underline hover:text-gray-600">Back</button>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <h1 className="text-2xl font-bold">AP Calculus {COURSE}</h1>
        {(["ab", "bc"] as const).map((c) => <button key={c} onClick={() => onCourse(c)} className={`text-sm px-2 py-1 rounded font-medium ${c === course ? "text-blue-600 bg-blue-100" : "text-gray-600 hover:bg-blue-100"}`}>{c.toUpperCase()}</button>)}
      </div>
      <div className="flex gap-2 mt-4 border-b border-gray-200">
        {([["topics", "Practice by topic"], ["papers", "Mock exams"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm font-semibold px-3 py-2 -mb-px border-b-2 ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{label}</button>
        ))}
      </div>
      {tab === "topics" ? (
        <>
          <p className="text-gray-600 mt-3 text-sm">Tick the topics you want to practice together.{course === "bc" && " Topics marked BC only are not on the AB exam."}</p>
          <div className="mt-4 space-y-4 text-sm">
            {unitsOf(course).map(([u, name]) => {
              const codes = topicsOfUnit(u, course).filter((t) => stats[t]);
              const all = codes.length > 0 && codes.every((t) => sel.has(t));
              return (
                <div key={u} className="rounded-lg bg-gray-50 p-3">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input type="checkbox" checked={all} onChange={(e) => toggle(codes, e.target.checked)} />
                    Unit {u}: {name}
                  </label>
                  <div className="mt-2 space-y-1 pl-6">
                    {codes.map((t) => (
                      <label key={t} className="flex items-start gap-2 cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5">
                        <input type="checkbox" className="mt-1" checked={sel.has(t)} onChange={(e) => toggle([t], e.target.checked)} />
                        <span className="flex-1">
                          {t} {TOPICS[t].name}{TOPICS[t].bcOnly && <span className="ml-2 text-xs font-semibold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5">BC only</span>}
                        </span>
                        <span className="text-gray-500 text-xs whitespace-nowrap pt-0.5">{stats[t].mc} MC · {stats[t].fr} FR · {stats[t].fin} done</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 bg-white pt-4 mt-2 flex gap-3">
            <button disabled={selCount === 0} onClick={() => open({ title: `${sel.size} topic${sel.size > 1 ? "s" : ""}`, label: "TOPIC PRACTICE", topics: [...sel] })}
              className="flex-1 rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:opacity-40">{selCount === 0 ? "Select topics to start" : `Start practice · ${selCount} questions`}</button>
            {sel.size > 0 && <button onClick={() => setSel(new Set())} className="text-sm text-gray-500 underline">Clear</button>}
          </div>
        </>
      ) : (
        <>
          <p className="text-gray-600 mt-3 text-sm">The multiple-choice questions of each past paper, together in exam order.</p>
          <div className="mt-4 space-y-2 text-sm">
            {papers.map(([p, e]) => (
              <button key={p} onClick={() => open({ title: `${p.slice(3)} ${COURSE} exam`, label: "MOCK EXAM", paper: p })} className="w-full text-left rounded-lg bg-gray-50 p-3 hover:bg-blue-50">
                <div className="font-semibold">{p.slice(3)} AP Calculus {COURSE}</div>
                <div className="text-gray-500">{e.n} multiple choice · {e.fin} done</div>
              </button>
            ))}
          </div>
          {course === "ab" && <button onClick={onExam} className="mt-6 w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700">Take the timed 2008 mock exam</button>}
        </>
      )}
    </>,
  );

  const crossedHere = q ? crossed[q.id] ?? [] : [];
  const choiceClass = (label: string) => {
    if (!chosen || !q.answer) return chosen === label ? "border-blue-600 bg-blue-50" : "border-gray-300 hover:border-blue-400";
    if (label === q.answer) return "border-green-600 bg-green-50";
    return label === chosen ? "border-red-500 bg-red-50" : "border-gray-300 opacity-60";
  };
  const close = () => setShowNav(false);
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-4 py-2">
        <div className="text-sm font-medium text-gray-800">AP Calculus {COURSE} · {src.title}</div>
        <div className="flex items-center gap-2">
          {KINDS.map(([k, label]) => (
            <button key={k} onClick={() => { setKind(k); setIdx(0); }} className={`text-sm px-2 py-1 rounded font-medium ${kind === k ? "text-blue-600 bg-blue-100" : "text-gray-600 hover:bg-blue-100"}`}>{label}</button>
          ))}
          <button onClick={() => setSrc(null)} className="text-sm px-2 py-1 rounded font-medium text-gray-600 hover:bg-blue-100">Back to list</button>
        </div>
      </header>
      <div className="bg-blue-900 text-white text-center text-xs font-semibold tracking-wide py-1">{src.label}</div>

      <main className="flex-1 min-h-0 overflow-y-auto">
        {!rows ? <p className="p-6 text-gray-400">Loading…</p> : !q ? <p className="p-6 text-gray-400">No questions here yet.</p> : (
          <div ref={splitRef} className="h-full flex">
            <div style={{ width: `${split}%` }} className="overflow-y-auto shrink-0"><Prompt q={q} /></div>
            <div onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={onMove}
              className="w-2 shrink-0 cursor-col-resize bg-gray-100 hover:bg-blue-100 border-x border-gray-200 flex items-center justify-center touch-none">
              <span className="text-gray-400 text-xs select-none">⋮</span>
            </div>
            <div style={{ width: `${100 - split}%` }} className="overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-2 border-b border-dashed border-gray-300 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-black text-white text-xs font-semibold">{idx + 1}</span>
                  <button onClick={() => setMarked((m) => ({ ...m, [q.id]: !m[q.id] }))} className={`text-sm flex items-center gap-1 ${marked[q.id] ? "text-blue-600" : "text-gray-600"}`}>
                    {marked[q.id] ? "🔖 Marked for Review" : "🔖 Mark for Review"}
                  </button>
                </div>
                {q.kind === "mc" && (
                  <button onClick={() => setEliminator((m) => !m)} title="Cross out answer choices you think are wrong."
                    className={`text-xs font-bold rounded px-2 py-1 ${eliminator ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>A̶B̶C̶</button>
                )}
              </div>
              <div className="p-6">
                {q.kind === "mc" ? (
                  <div className="space-y-2">
                    {q.choices.map((c) => {
                      const out = crossedHere.includes(c.label);
                      return (
                        <div key={c.label} className="flex items-center gap-2">
                          <button onClick={() => choose(q, c.label)} disabled={out || Boolean(chosen)}
                            className={`flex-1 flex items-center gap-3 border-2 rounded-lg px-3 py-1.5 text-left transition-colors ${choiceClass(c.label)} ${out ? "opacity-40 cursor-not-allowed" : ""}`}>
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 text-xs font-semibold ${chosen === c.label ? "bg-blue-600 border-blue-600 text-white" : "border-gray-400 text-gray-700"}`}>{c.label}</span>
                            <span className={`exam-serif ib-md !text-base ${out ? "line-through" : ""}`}><MdMath>{stripLabel(c.text)}</MdMath></span>
                          </button>
                          {eliminator && !chosen && (
                            <button onClick={() => cross(q.id, c.label)} className="w-7 h-7 rounded-full border border-gray-400 text-gray-500 text-xs shrink-0 relative" title={out ? "Undo cross-out" : "Cross out this choice"}>
                              {c.label}{out && <span className="absolute left-0 right-0 top-1/2 border-t border-gray-600" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {chosen && <p className={`text-sm font-semibold pt-2 ${!q.answer ? "text-gray-500" : chosen === q.answer ? "text-green-700" : "text-red-600"}`}>
                      {!q.answer ? "No answer key for this question yet." : chosen === q.answer ? "Correct" : `Incorrect. The correct answer is ${q.answer}.`}</p>}
                  </div>
                ) : !q.rubric ? <p className="text-sm text-gray-500">No scoring guideline for this question yet.</p>
                  : revealed[q.id] ? <div><p className="font-semibold text-green-700 mb-1">Scoring guideline</p><Md>{q.rubric}</Md></div>
                  : <button onClick={() => { setRevealed((r) => ({ ...r, [q.id]: true })); mark(q.id, 1); }} className="rounded-full bg-blue-600 text-white font-semibold px-6 py-2 hover:bg-blue-700">Show scoring guideline</button>}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between bg-blue-50 border-t border-blue-100 px-6 py-3">
        <button onClick={() => go(idx - 1)} disabled={idx === 0} className="text-sm font-semibold text-gray-700 disabled:opacity-30">← Back</button>
        {q && <button onClick={() => setShowNav(true)} className="text-sm font-semibold bg-black text-white rounded-full px-5 py-2 hover:bg-gray-800">Question {idx + 1} of {shown.length} ⌄</button>}
        <button onClick={() => go(idx + 1)} disabled={idx >= shown.length - 1} className="text-sm font-semibold bg-blue-600 text-white rounded-full px-6 py-2 hover:bg-blue-700 disabled:opacity-30">Next →</button>
      </footer>
      {showNav && <Navigator items={shown.map((x, n) => ({ questionno: n + 1, answered: !!done[x.id], marked: !!marked[x.id] }))} currentIndex={idx} onJump={(n) => { go(n); close(); }} onClose={close} onReview={close} />}
    </div>
  );
}
