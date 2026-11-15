"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { supabase } from "@/lib/browser";
import Navigator from "./Navigator";

// College Board CED units of AP Calculus AB (BC adds 9 and 10 later)
const UNITS: Record<number, string> = {
  1: "Limits and Continuity", 2: "Differentiation: Definition and Fundamental Properties", 3: "Differentiation: Composite, Implicit, and Inverse Functions",
  4: "Contextual Applications of Differentiation", 5: "Analytical Applications of Differentiation", 6: "Integration and Accumulation of Change",
  7: "Differential Equations", 8: "Applications of Integration",
};
type Row = { id: string; unit: number; kind: "mc" | "fr"; year: number | null; number: string; prompt: string; choices: { label: string; text: string }[]; parts: { label: string; text: string }[]; answer: string | null; rubric: string | null };
type Mark = 1 | "c" | "w";
const KEY = "ap-calc-ab-done-v1";
const readDone = (): Record<string, Mark> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const writeDone = (d: Record<string, Mark>) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: progress just isn't kept */ } };

const Md = ({ children }: { children: string }) => (
  <div className="exam-serif ib-md"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown></div>
);

async function loadAll(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("ap_practice").select("id,unit,kind,year,number,prompt,choices,parts,answer,rubric").eq("course", "ab").order("unit").order("year", { ascending: false }).order("id").range(from, from + 999);
    if (error) throw new Error("Could not load AP Calculus questions.");
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function ApPractice({ onBack, onExam }: { onBack: () => void; onExam: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState<number | null>(null);
  const [kind, setKind] = useState<"all" | "mc" | "fr">("all");
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Record<string, Mark>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [crossed, setCrossed] = useState<Record<string, string[]>>({});
  const [eliminator, setEliminator] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [split, setSplit] = useState(50);
  const splitRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setDone(readDone()); loadAll().then(setRows).catch((e: Error) => setError(e.message)); }, []);
  const byUnit = useMemo(() => {
    const m: Record<number, { mc: number; fr: number }> = {};
    for (const r of rows ?? []) { (m[r.unit] ??= { mc: 0, fr: 0 })[r.kind]++; }
    return m;
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => r.unit === unit && (kind === "all" || r.kind === kind)), [rows, unit, kind]);
  const q = shown[idx];

  const mark = (id: string, m: Mark) => setDone((cur) => { const next = { ...cur }; if (next[id] !== "c" && next[id] !== "w") next[id] = m; else if (m !== 1) next[id] = m; writeDone(next); return next; });
  const go = (n: number) => { setIdx(Math.max(0, Math.min(shown.length - 1, n))); setReveal(false); };
  const choose = (r: Row, L: string) => { setPicks((p) => ({ ...p, [r.id]: L })); if (r.answer) mark(r.id, L === r.answer ? "c" : "w"); else mark(r.id, 1); };
  const cross = (id: string, L: string) => setCrossed((c) => ({ ...c, [id]: (c[id] ?? []).includes(L) ? (c[id] ?? []).filter((x) => x !== L) : [...(c[id] ?? []), L] }));
  const open = (u: number) => { setUnit(u); setIdx(0); setReveal(false); setKind("all"); };
  const onDown = (e: React.PointerEvent) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!dragging.current || !splitRef.current) return; const r = splitRef.current.getBoundingClientRect(); setSplit(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100))); };
  const onUp = () => { dragging.current = false; };

  // keyboard like the exam: A-E choose, arrows move
  useEffect(() => {
    if (unit === null || !q) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") go(idx + 1); else if (e.key === "ArrowLeft") go(idx - 1);
      else if (q.kind === "mc" && !picks[q.id] && /^[a-eA-E]$/.test(e.key) && q.choices.some((c) => c.label === e.key.toUpperCase())) choose(q, e.key.toUpperCase());
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const shell = (children: React.ReactNode) => (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="max-w-2xl w-full border border-gray-200 rounded-2xl p-8 shadow-sm">{children}</div>
    </main>
  );

  if (error) return shell(<p className="text-red-600">{error}</p>);
  if (!rows) return <main className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</main>;

  // ---- unit list (same card style as the exam start page)
  if (unit === null) return shell(
    <>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide text-blue-700">AP Practice</span>
        <button onClick={onBack} className="text-gray-400 underline hover:text-gray-600">Back</button>
      </div>
      <h1 className="text-2xl font-bold mt-1">AP Calculus AB</h1>
      <p className="text-gray-600 mt-1">Practice by College Board unit</p>
      <div className="mt-6 space-y-3 text-sm">
        {Object.entries(UNITS).map(([u, name]) => {
          const c = byUnit[+u] ?? { mc: 0, fr: 0 };
          const fin = rows.filter((r) => r.unit === +u && done[r.id]).length;
          return (
            <button key={u} onClick={() => open(+u)} className="w-full text-left rounded-lg bg-gray-50 p-3 hover:bg-blue-50">
              <div className="font-semibold">Unit {u}: {name}</div>
              <div className="text-gray-500">{c.mc} multiple choice · {c.fr} free response · {fin} done</div>
            </button>
          );
        })}
      </div>
      <button onClick={onExam} className="mt-6 w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700">Take the timed 2008 mock exam</button>
    </>,
  );

  const crossedHere = q ? crossed[q.id] ?? [] : [];
  const chosen = q ? picks[q.id] : undefined;
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between bg-blue-50 border-b border-blue-100 px-4 py-2">
        <div className="text-sm font-medium text-gray-800">AP Calculus AB · Unit {unit}: {UNITS[unit]}</div>
        <div className="flex items-center gap-2">
          {(["all", "mc", "fr"] as const).map((k) => (
            <button key={k} onClick={() => { setKind(k); setIdx(0); setReveal(false); }} className={`text-sm px-2 py-1 rounded font-medium ${kind === k ? "text-blue-600 bg-blue-100" : "text-gray-600 hover:bg-blue-100"}`}>{{ all: "All", mc: "MC", fr: "FR" }[k]}</button>
          ))}
          <button onClick={() => setUnit(null)} className="text-sm px-2 py-1 rounded font-medium text-gray-600 hover:bg-blue-100">All units</button>
        </div>
      </header>
      <div className="bg-blue-900 text-white text-center text-xs font-semibold tracking-wide py-1">UNIT PRACTICE</div>

      <main className="flex-1 min-h-0 overflow-y-auto">
        {!q ? <p className="p-6 text-gray-400">No questions here yet.</p> : (
          <div ref={splitRef} className="h-full flex">
            <div style={{ width: `${split}%` }} className="overflow-y-auto shrink-0">
              <div className="p-6 max-w-none exam-serif">
                <p className="text-xs text-gray-400 mb-2">{q.kind === "mc" ? "Multiple choice" : "Free response"}{q.year ? ` · ${q.year}` : ""}{q.number ? ` · Question ${q.number}` : ""}</p>
                <Md>{q.prompt}</Md>
                {q.kind === "fr" && q.parts.map((p) => <div key={p.label} className="mt-2"><strong>({p.label})</strong> <Md>{p.text}</Md></div>)}
              </div>
            </div>
            <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
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
                      const on = chosen === c.label;
                      const verdict = chosen && q.answer ? (c.label === q.answer ? "border-green-600 bg-green-50" : on ? "border-red-500 bg-red-50" : "border-gray-300 opacity-60") : on ? "border-blue-600 bg-blue-50" : "border-gray-300 hover:border-blue-400";
                      return (
                        <div key={c.label} className="flex items-center gap-2">
                          <button onClick={() => choose(q, c.label)} disabled={out || Boolean(chosen)}
                            className={`flex-1 flex items-center gap-3 border-2 rounded-lg px-3 py-1.5 text-left transition-colors ${verdict} ${out ? "opacity-40 cursor-not-allowed" : ""}`}>
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 text-xs font-semibold ${on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-400 text-gray-700"}`}>{c.label}</span>
                            <span className={`exam-serif ib-md !text-base ${out ? "line-through" : ""}`}><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{c.text.replace(/^\(?[A-E][).]\s*/, "")}</ReactMarkdown></span>
                          </button>
                          {eliminator && !chosen && (
                            <button onClick={() => cross(q.id, c.label)} className="w-7 h-7 rounded-full border border-gray-400 text-gray-500 text-xs shrink-0 relative" title={out ? "Undo cross-out" : "Cross out this choice"}>
                              {c.label}{out && <span className="absolute left-0 right-0 top-1/2 border-t border-gray-600" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {chosen && q.answer && <p className={`text-sm font-semibold pt-2 ${chosen === q.answer ? "text-green-700" : "text-red-600"}`}>{chosen === q.answer ? "Correct" : `Incorrect. The correct answer is ${q.answer}.`}</p>}
                    {chosen && !q.answer && <p className="text-sm text-gray-500 pt-2">No answer key for this question yet.</p>}
                  </div>
                ) : q.rubric ? (
                  reveal ? <div><p className="font-semibold text-green-700 mb-1">Scoring guideline</p><Md>{q.rubric}</Md></div>
                    : <button onClick={() => { setReveal(true); mark(q.id, 1); }} className="rounded-full bg-blue-600 text-white font-semibold px-6 py-2 hover:bg-blue-700">Show scoring guideline</button>
                ) : <p className="text-sm text-gray-500">No scoring guideline for this question yet.</p>}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between bg-blue-50 border-t border-blue-100 px-6 py-3">
        <button onClick={() => go(idx - 1)} disabled={idx === 0} className="text-sm font-semibold text-gray-700 disabled:opacity-30">← Back</button>
        <button onClick={() => setShowNav(true)} disabled={!q} className="text-sm font-semibold bg-black text-white rounded-full px-5 py-2 hover:bg-gray-800">Question {shown.length ? idx + 1 : 0} of {shown.length} ⌄</button>
        <button onClick={() => go(idx + 1)} disabled={idx >= shown.length - 1} className="text-sm font-semibold bg-blue-600 text-white rounded-full px-6 py-2 hover:bg-blue-700 disabled:opacity-30">Next →</button>
      </footer>
      {showNav && <Navigator items={shown.map((x, n) => ({ questionno: n + 1, answered: !!done[x.id], marked: !!marked[x.id] }))} currentIndex={idx} onJump={(n) => { go(n); setShowNav(false); }} onClose={() => setShowNav(false)} onReview={() => setShowNav(false)} />}
    </div>
  );
}
