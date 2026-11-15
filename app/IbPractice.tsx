"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { supabase } from "@/lib/browser";
import { fetchProgress, IB_GROUPS, loadQuestions, loadTree, saveProgress, sortSubtopics, sortTopics, type Done, type IbMeta, type IbQuestion, type Mark } from "@/lib/ib";
import Login from "./Login";
import { Md } from "./Md";

// per-browser record of questions the student has looked at the answer of: { "<group>": { REF: 1 } }
const CELL: Record<Mark, string> = { 1: "bg-green-100 border-green-400 text-green-800", c: "bg-green-500 border-green-700 text-white", p: "bg-amber-400 border-amber-600 text-white", w: "bg-red-500 border-red-700 text-white" };
const PICKS_KEY = "ib-picks-v1";
const DONE_KEY = "ib-done-v1";
const readDone = (): Done => { try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}"); } catch { return {}; } };
const writeDone = (d: Done) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { /* private mode: progress just isn't kept */ } };

export default function IbPractice({ onBack }: { onBack: () => void }) {
  const [group, setGroup] = useState<string>(IB_GROUPS[0].key);
  const [tree, setTree] = useState<{ metas: IbMeta[]; names: Record<string, string> } | null>(null);
  const [sel, setSel] = useState<{ topic: string; subtopic: string } | null>(null);
  const [qs, setQs] = useState<IbQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [done, setDone] = useState<Done>({});
  const [email, setEmail] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [saveWarn, setSaveWarn] = useState(false);
  const [error, setError] = useState("");
  const [picks, setPicks] = useState<Record<string, string>>({});   // "REF|part" -> chosen letter
  const [diff, setDiff] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [calc, setCalc] = useState<"all" | "yes" | "no">("all");

  useEffect(() => { setDone(readDone()); try { setPicks(JSON.parse(localStorage.getItem(PICKS_KEY) ?? "{}")); } catch { /* no saved picks */ } }, []);
  // signed in: show the account's record next to this browser's, and keep both
  useEffect(() => {
    const apply = (e: string | null) => {
      setEmail(e);
      if (!e) return;
      setLoggingIn(false);
      fetchProgress().then((remote) => setDone((cur) => {
        const next: Done = { ...cur };
        for (const [k, v] of Object.entries(remote)) next[k] = { ...next[k], ...v };
        writeDone(next); return next;
      })).catch(() => setSaveWarn(true));
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  // answers looked at before signing in are copied into the account once the subject's chapters are known
  const [synced, setSynced] = useState<string | null>(null);
  useEffect(() => {
    if (!email || !tree || synced === `${email}/${group}`) return;
    setSynced(`${email}/${group}`);
    const by = new Map<string, { topic: string; subtopic: string; marks: Record<string, Mark> }>();
    for (const m of tree.metas) if (done[group]?.[m.ref]) { const k = `${m.topic}|${m.subtopic}`; by.set(k, by.get(k) ?? { topic: m.topic, subtopic: m.subtopic, marks: {} }); by.get(k)!.marks[m.ref] = done[group][m.ref]; }
    void Promise.all([...by.values()].map((b) => saveProgress(group, b.topic, b.subtopic, b.marks))).catch(() => setSaveWarn(true));
  }, [email, tree, group, done, synced]);
  useEffect(() => {
    setTree(null); setSel(null); setQs(null); setError("");
    loadTree(group).then(setTree).catch((e: Error) => setError(e.message));
  }, [group]);

  const topics = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of tree?.metas ?? []) {
      const t = m.get(r.topic) ?? new Map<string, number>();
      t.set(r.subtopic, (t.get(r.subtopic) ?? 0) + 1);
      m.set(r.topic, t);
    }
    return m;
  }, [tree]);

  function open(topic: string, subtopic: string) {
    if (!tree) return;
    setSel({ topic, subtopic }); setQs(null); setDiff("all"); setCalc("all"); setIdx(0); setShowAnswer(false); setError("");
    loadQuestions(topic, subtopic, tree.names).then(setQs).catch((e: Error) => setError(e.message));
  }
  function refilter(d: typeof diff, c: typeof calc) { setDiff(d); setCalc(c); setIdx(0); setShowAnswer(false); }
  function go(n: number) { setIdx(n); setShowAnswer(false); window.scrollTo({ top: 0 }); }
  function record(q: IbQuestion, mark: Mark) {
    const next: Done = { ...done, [group]: { ...done[group], [q.ref]: mark } };
    setDone(next); writeDone(next);
    if (email) saveProgress(group, q.topic, q.subtopic, { [q.ref]: mark }).then(() => setSaveWarn(false)).catch(() => setSaveWarn(true));
  }
  // answering every part of a written question's multiple-choice set marks it: all right = correct, none = wrong, else partly
  function pick(q: IbQuestion, part: string, letter: string) {
    const key = `${q.ref}|${part}`;
    if (picks[key]) return;
    const next = { ...picks, [key]: letter };
    setPicks(next);
    try { localStorage.setItem(PICKS_KEY, JSON.stringify(next)); } catch { /* picks just aren't kept */ }
    const items = q.choices ?? [];
    if (items.every((it) => next[`${q.ref}|${it.part}`])) {
      const right = items.filter((it) => next[`${q.ref}|${it.part}`] === it.correct).length;
      record(q, right === items.length ? "c" : right === 0 ? "w" : "p");
    }
  }
  // looking at the answer counts as done, but never overwrites a self-mark
  function reveal() {
    setShowAnswer(true);
    if (q && !done[group]?.[q.ref]) record(q, 1);
  }

  const shown = useMemo(() => (qs ?? []).filter((x) => (diff === "all" || x.difficulty === diff) && (calc === "all" || (calc === "yes") === Boolean(x.calculator))), [qs, diff, calc]);
  const q = shown[idx];
  const doneIn = (topic: string, subtopic: string) => (tree?.metas ?? []).filter((r) => r.topic === topic && r.subtopic === subtopic && done[group]?.[r.ref]).length;

  if (loggingIn) return (<><button onClick={() => setLoggingIn(false)} className="absolute left-4 top-4 text-sm text-blue-700 hover:underline">← Back</button><Login onSignedIn={() => setLoggingIn(false)} /></>);
  return (
    <main className={`duo flex-1 w-full mx-auto px-4 py-2 ${sel ? "max-w-4xl" : "max-w-6xl"}`}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={sel ? () => { setSel(null); setQs(null); } : onBack} className="text-sm font-extrabold text-sky-600 hover:text-sky-500">← {sel ? "Topics" : "Back"}</button>
        <p className="text-xs font-extrabold tracking-widest text-green-600">IB PRACTICE</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 text-xs text-gray-500 -mt-2 mb-3">
        {email ? (<><span>Saved to account {email}</span><button onClick={() => void supabase.auth.signOut()} className="font-bold text-sky-600 hover:underline">Sign out</button></>)
          : <button onClick={() => setLoggingIn(true)} className="font-bold text-sky-600 hover:underline">Sign in to save your progress to your account</button>}
        {saveWarn && <span className="text-red-600">Could not sync to your account. Saved on this device for now.</span>}
      </div>

      {!sel && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {IB_GROUPS.map((g) => (
              <button key={g.key} onClick={() => setGroup(g.key)} className={`chip ${group === g.key ? "chip-active" : ""}`}>{g.label}</button>
            ))}
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!tree && !error && <p className="text-gray-400 text-sm">Loading…</p>}
          {tree && (
            <div className="space-y-2">
              {sortTopics(group, [...topics.keys()]).map((topic) => {
                const subs = topics.get(topic)!;
                return (
                  <div key={topic} className="duo-card flex gap-4 px-3 py-2">
                    <h2 className="w-44 shrink-0 text-sm font-extrabold text-gray-700 pt-1">{topic}</h2>
                    <ul className="flex flex-wrap gap-1.5">
                      {sortSubtopics(group, topic, [...subs.keys()]).map((sub) => (
                        <li key={sub}>
                          <button onClick={() => open(topic, sub)} className="duo-pick text-left px-2.5 py-0.5">
                            <span className="block text-[13px] font-bold leading-tight text-gray-800">{sub}</span>
                            <span className="text-[11px] font-bold text-green-600">{doneIn(topic, sub)} / {subs.get(sub)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {sel && (
        <>
          <h1 className="text-2xl font-extrabold text-gray-800">{sel.subtopic}</h1>
          <p className="text-sm font-bold text-gray-400 mb-4">{sel.topic}</p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {!qs && !error && <p className="text-gray-400 text-sm">Loading…</p>}
          {qs && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-sm">
              <span className="flex items-center gap-1.5"><span className="text-gray-500">Difficulty</span>
                {(["all", "easy", "medium", "hard"] as const).map((d) => (
                  <button key={d} onClick={() => refilter(d, calc)} className={`chip !py-0.5 !text-xs ${diff === d ? "chip-active" : ""}`}>{d === "all" ? "All" : d}</button>
                ))}
              </span>
              <span className="flex items-center gap-1.5"><span className="text-gray-500">Calculator</span>
                {([["all", "All"], ["yes", "Allowed"], ["no", "Not allowed"]] as const).map(([c, label]) => (
                  <button key={c} onClick={() => refilter(diff, c)} className={`chip !py-0.5 !text-xs ${calc === c ? "chip-active" : ""}`}>{label}</button>
                ))}
              </span>
              <span className="text-xs text-gray-500">{shown.length} / {qs.length} questions</span>
            </div>
          )}
          {qs && !q && <p className="text-gray-500 text-sm">No questions match these filters.</p>}
          {qs && q && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {shown.map((x, n) => (
                  <button key={x.ref} onClick={() => go(n)} title={`${x.ref}${{ 1: " · answer viewed", c: " · correct", p: " · partly", w: " · wrong" }[done[group]?.[x.ref] ?? 0 as 1] ?? ""}`} aria-label={`Question ${n + 1}${done[group]?.[x.ref] ? ", done" : ""}`} className={`relative w-9 h-9 rounded-full text-xs font-extrabold border-2 border-b-4 ${n === idx ? "bg-sky-500 text-white border-sky-700 ring-4 ring-sky-200" : done[group]?.[x.ref] ? CELL[done[group][x.ref]] : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>
                    {n + 1}
                    {done[group]?.[x.ref] && <span className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[9px] leading-[14px] ${n === idx ? "bg-green-500 text-white" : "bg-white text-green-700 border border-green-600"}`}>✓</span>}
                  </button>
                ))}
              </div>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500 -mt-2 mb-3">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-500 align-middle mr-1" />Answer viewed</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500 align-middle mr-1" />Correct</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 align-middle mr-1" />Partly</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 align-middle mr-1" />Wrong</span>
                <span>· {shown.filter((x) => done[group]?.[x.ref]).length} / {shown.length} done</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                <span className="font-mono">{q.ref}</span>
                {q.paper && q.paper !== "?" && <span>{q.paper}</span>}
                {q.marks != null && <span>{q.marks} mark{q.marks === 1 ? "" : "s"}</span>}
                {q.difficulty && <span className={`rounded-full px-2 py-0.5 font-semibold ${q.difficulty === "easy" ? "bg-green-100 text-green-800" : q.difficulty === "hard" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{q.difficulty}</span>}
                {q.calculator != null && <span className={`rounded-full px-2 py-0.5 font-semibold ${q.calculator ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-700"}`}>{q.calculator ? "Calculator" : "No calculator"}</span>}
              </div>
              <article className="duo-card p-5 sm:p-6"><Md>{q.body}</Md></article>
              {q.choices && q.choices.length > 0 && (
                <section className="mt-4 space-y-4">
                  <p className="text-xs font-extrabold tracking-widest text-sky-600">CHECK YOUR ANSWERS ({q.choices.filter((it) => picks[`${q.ref}|${it.part}`]).length} / {q.choices.length})</p>
                  {q.choices.map((it) => {
                    const chosen = picks[`${q.ref}|${it.part}`];
                    return (
                      <div key={it.part} className="duo-card p-4 sm:p-5">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Part {it.part}</p>
                        <Md>{it.stem}</Md>
                        <ul className="mt-3 grid gap-2">
                          {(["A", "B", "C", "D"] as const).map((L) => (
                            <li key={L}>
                              <button disabled={Boolean(chosen)} onClick={() => pick(q, it.part, L)} className={`duo-pick w-full text-left flex gap-3 items-start px-3 py-2 ${chosen ? (L === it.correct ? "duo-right" : L === chosen ? "duo-wrong" : "opacity-50") : ""}`}>
                                <span className="font-extrabold w-7 h-7 shrink-0 rounded-lg border-2 border-gray-200 text-gray-500 text-sm grid place-items-center">{L}</span><span className="exam-serif ib-md !text-base"><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{it.options[L]}</ReactMarkdown></span>
                                {chosen && L === it.correct && <span className="ml-auto text-xs font-extrabold text-green-700">Correct</span>}
                                {chosen && L === chosen && L !== it.correct && <span className="ml-auto text-xs font-extrabold text-red-600">Your answer</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </section>
              )}
              {!showAnswer ? (
                <button onClick={reveal} className="btn-duo btn-duo-secondary mt-4">Show answer / Mark scheme</button>
              ) : (
                <article className="duo-card mt-4 !border-green-300 !bg-green-50/50 p-5 sm:p-6">
                  <p className="text-xs font-extrabold tracking-widest text-green-700 mb-2">MARK SCHEME</p>
                  {q.mark_scheme ? <Md>{q.mark_scheme}</Md> : <p className="text-sm text-gray-500">No mark scheme for this question.</p>}
                </article>
              )}
              <div className="flex justify-between mt-6">
                <button disabled={idx === 0} onClick={() => go(idx - 1)} className="btn-duo btn-duo-outline !py-2 !px-5 text-sm">Previous</button>
                <span className="text-sm font-extrabold text-gray-400 self-center">{idx + 1} / {shown.length}</span>
                <button disabled={idx === shown.length - 1} onClick={() => go(idx + 1)} className="btn-duo btn-duo-primary !py-2 !px-6 text-sm">Next</button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
