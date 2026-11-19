"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/browser";
import { Md, MdMath } from "./Md";
import { SCI } from "./apSciTopics";

type Q = { id: string; unit: number; topic: string; year: number | null; number: string; prompt: string; choices: { label: string; text: string }[]; answer: string };
type CourseKey = keyof typeof SCI;
const KEY = "ap-physics-done-v1";
const readDone = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };

export default function ApPhysics({ onBack, course = "p1" }: { onBack: () => void; course?: CourseKey }) {
  const C = SCI[course];
  const [all, setAll] = useState<Q[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [set, setSet] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => { setDone(readDone()); }, []);
  useEffect(() => {
    void (async () => {
      const rows: Q[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await supabase.from("ap_practice").select("id,unit,topic,year,number,prompt,choices,answer").eq("course", course).order("id").range(from, from + 999);
        if (e || !data) { setError("Could not load these questions."); return; }
        rows.push(...(data as Q[]));
        if (data.length < 1000) break;
      }
      setAll(rows);
    })();
  }, [course]);

  const code = (q: Q) => q.topic.split(":")[1];
  const counts = useMemo(() => { const m: Record<string, { n: number; d: number }> = {}; for (const q of all ?? []) { const e = (m[code(q)] ??= { n: 0, d: 0 }); e.n++; if (done[q.id]) e.d++; } return m; }, [all, done]);

  const start = () => { setSet((all ?? []).filter((q) => picked.includes(code(q))).sort((a, b) => Object.keys(C.topics).indexOf(code(a)) - Object.keys(C.topics).indexOf(code(b)) || (b.year ?? 0) - (a.year ?? 0) || +a.number - +b.number)); setI(0); setSel([]); setChecked(false); };
  const q = set?.[i];
  const multi = (q?.answer.length ?? 0) > 1;
  const pick = (l: string) => { if (checked) return; setSel((s) => (multi ? (s.includes(l) ? s.filter((x) => x !== l) : [...s, l]) : [l])); };
  const check = () => {
    if (!q) return;
    setChecked(true);
    if ([...sel].sort().join("") === q.answer) { const d = { ...done, [q.id]: true }; setDone(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* progress just isn't kept */ } }
  };
  const go = (n: number) => { setI(n); setSel([]); setChecked(false); };

  if (set && q) {
    const right = [...sel].sort().join("") === q.answer;
    return (
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        <button onClick={() => setSet(null)} className="text-sm text-blue-700 hover:underline">← Back to topics</button>
        <p className="text-xs text-gray-400 mt-4 mb-2">{q.year ? `${q.year} ` : ""}Multiple choice · Question {q.number} · {code(q)} {C.topics[code(q)]} · {i + 1} of {set.length}</p>
        <Md>{q.prompt}</Md>
        {multi && <p className="text-sm text-gray-500 mt-3">Select {q.answer.length} answers.</p>}
        <div className="mt-4 space-y-2">
          {q.choices.map((c) => {
            const on = sel.includes(c.label), ok = q.answer.includes(c.label);
            const cls = checked ? (ok ? "border-green-500 bg-green-50" : on ? "border-red-400 bg-red-50" : "border-gray-200") : on ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50";
            return <button key={c.label} onClick={() => pick(c.label)} className={`w-full text-left flex gap-3 rounded-lg border-2 px-3 py-2 ${cls}`}><b>{c.label}</b><span className="flex-1"><MdMath>{c.text}</MdMath></span></button>;
          })}
        </div>
        <div className="mt-5 flex items-center gap-3">
          {!checked ? <button disabled={!sel.length} onClick={check} className="rounded-full bg-blue-600 text-white font-semibold px-6 py-2 disabled:opacity-40">Check</button>
            : <span className={`font-semibold ${right ? "text-green-700" : "text-red-600"}`}>{right ? "Correct" : `Not quite. The answer is ${q.answer}.`}</span>}
          <span className="flex-1" />
          <button disabled={i === 0} onClick={() => go(i - 1)} className="px-3 py-2 text-sm disabled:opacity-30">Previous</button>
          <button disabled={i === set.length - 1} onClick={() => go(i + 1)} className="px-3 py-2 text-sm disabled:opacity-30">Next</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
      <button onClick={onBack} className="text-sm text-blue-700 hover:underline">← Back</button>
      <h1 className="text-2xl font-extrabold text-gray-800 mt-4">{C.name}</h1>
      <p className="text-gray-600 text-sm mt-1">Tick the topics you want to practice together.</p>
      {error && <p className="text-red-600 mt-4">{error}</p>}
      {!all && !error && <p className="text-gray-400 mt-6">Loading…</p>}
      <div className="mt-4 space-y-5">
        {Object.entries(C.units).map(([u, name]) => {
          const codes = Object.keys(C.topics).filter((t) => t.split(".")[0] === u && counts[t]);
          return codes.length > 0 && (
            <div key={u}>
              <h2 className="font-bold text-gray-700 mb-2">Unit {u}: {name}</h2>
              <div className="space-y-2">
                {codes.map((t) => (
                  <label key={t} className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-3 py-3 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={picked.includes(t)} onChange={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} />
                    <span className="flex-1"><b>{t}</b> {C.topics[t]}</span>
                    <span className="text-xs text-gray-500">{counts[t].n} MC · {counts[t].d} done</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button disabled={!picked.length} onClick={start} className="mt-6 w-full rounded-full bg-blue-600 text-white font-semibold py-3 disabled:opacity-40">{picked.length ? `Start practice · ${picked.reduce((s, t) => s + (counts[t]?.n ?? 0), 0)} questions` : "Select topics to start"}</button>
    </main>
  );
}
