"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/browser";
import { Md, MdMath } from "./Md";

type Q = { id: string; unit: number; year: number | null; number: string; prompt: string; choices: { label: string; text: string }[]; answer: string };
const COURSES = {
  p1: { name: "AP Physics 1", units: { 1: "Kinematics", 2: "Force and Translational Dynamics", 3: "Work, Energy, and Power", 4: "Linear Momentum", 5: "Torque and Rotational Dynamics", 6: "Energy and Momentum of Rotating Systems", 7: "Oscillations", 8: "Fluids" } },
} as const;
type CourseKey = keyof typeof COURSES;
const KEY = "ap-physics-done-v1";
const readDone = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };

export default function ApPhysics({ onBack, course = "p1" }: { onBack: () => void; course?: CourseKey }) {
  const C = COURSES[course];
  const [all, setAll] = useState<Q[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
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
        const { data, error: e } = await supabase.from("ap_practice").select("id,unit,year,number,prompt,choices,answer").eq("course", course).order("id").range(from, from + 999);
        if (e || !data) { setError("Could not load these questions."); return; }
        rows.push(...(data as Q[]));
        if (data.length < 1000) break;
      }
      setAll(rows);
    })();
  }, [course]);

  const counts = useMemo(() => { const m: Record<number, { n: number; d: number }> = {}; for (const q of all ?? []) { const e = (m[q.unit] ??= { n: 0, d: 0 }); e.n++; if (done[q.id]) e.d++; } return m; }, [all, done]);

  const start = () => { setSet((all ?? []).filter((q) => picked.includes(q.unit)).sort((a, b) => a.unit - b.unit || (b.year ?? 0) - (a.year ?? 0) || +a.number - +b.number)); setI(0); setSel([]); setChecked(false); };
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
        <button onClick={() => setSet(null)} className="text-sm text-blue-700 hover:underline">← Back to units</button>
        <p className="text-xs text-gray-400 mt-4 mb-2">{q.year ? `${q.year} ` : ""}Multiple choice · Question {q.number} · {C.units[q.unit as keyof typeof C.units]} · {i + 1} of {set.length}</p>
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
      <p className="text-gray-600 text-sm mt-1">Tick the units you want to practice together.</p>
      {error && <p className="text-red-600 mt-4">{error}</p>}
      {!all && !error && <p className="text-gray-400 mt-6">Loading…</p>}
      <div className="mt-4 space-y-2">
        {Object.entries(C.units).map(([u, name]) => counts[+u] && (
          <label key={u} className="flex items-center gap-3 rounded-lg border-2 border-gray-200 px-3 py-3 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={picked.includes(+u)} onChange={() => setPicked((p) => (p.includes(+u) ? p.filter((x) => x !== +u) : [...p, +u]))} />
            <span className="flex-1"><b>Unit {u}</b> {name}</span>
            <span className="text-xs text-gray-500">{counts[+u].n} MC · {counts[+u].d} done</span>
          </label>
        ))}
      </div>
      <button disabled={!picked.length} onClick={start} className="mt-6 w-full rounded-full bg-blue-600 text-white font-semibold py-3 disabled:opacity-40">{picked.length ? `Start practice · ${picked.reduce((s, u) => s + (counts[u]?.n ?? 0), 0)} questions` : "Select units to start"}</button>
    </main>
  );
}
