"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/browser";
import { Md } from "./Md";
import { TOPICS } from "./apTopics";

// 章节补充题库：ap_book_questions 表，867 道选择题，按 AP topic 归类
const UNITS: Record<number, string> = {
  1: "Limits and Continuity",
  2: "Differentiation: Definition and Fundamental Properties",
  3: "Differentiation: Composite, Implicit, and Inverse Functions",
  4: "Contextual Applications of Differentiation",
  5: "Analytical Applications of Differentiation",
  6: "Integration and Accumulation of Change",
  7: "Differential Equations",
  8: "Applications of Integration",
  9: "Parametric Equations, Polar Coordinates, and Vector-Valued Functions",
  10: "Infinite Sequences and Series",
};

type Item = { label: string; text: string };
type Row = {
  id: number;
  book_chapter: string;
  number: string;
  seq: number;
  ap_topic: string | null;
  ap_confident: boolean;
  needs_review: boolean;
  prompt: string;
  choices: Item[];
  answer: string | null;
  explanation: string | null;
};

const IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() + "/storage/v1/object/public/ap-book/";
// 题干里公式是 ![](images/x.jpg)，换成 Storage 公网地址
const fix = (s: string) => s
  .replace(/\]\(images\//g, "](" + IMG_BASE)
  // 解析时把 <sup>n</sup> 转成了 ^(n)，这里还原成 KaTeX 上标
  .replace(/\^\(([^)]+)\)/g, (_, e) => `$^{${e}}$`)
  .replace(/_\(([^)]+)\)/g, (_, e) => `$_{${e}}$`);

const DONE_KEY = "ap-book-done-v1";
const readDone = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}"); } catch { return {}; }
};

async function loadAll(): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("ap_book_questions")
      .select("id,book_chapter,number,seq,ap_topic,ap_confident,needs_review,prompt,choices,answer,explanation")
      .order("id")
      .range(from, from + 999);
    if (error || !data) throw new Error("题库加载失败");
    all.push(...(data as Row[]));
    if (data.length < 1000) return all;
  }
}

export default function ApBook({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState<string>("1");
  const [open, setOpen] = useState<{ topic: string; list: Row[] } | null>(null);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDone(readDone());
    loadAll().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  const byTopic = useMemo(() => {
    const m = new Map<string, Row[]>();
    (rows ?? []).forEach((r) => {
      if (!r.ap_topic) return;
      if (!m.has(r.ap_topic)) m.set(r.ap_topic, []);
      m.get(r.ap_topic)!.push(r);
    });
    return m;
  }, [rows]);

  const topics = useMemo(
    () => [...byTopic.keys()].sort((a, b) => {
      const [au, at] = a.split(".").map(Number);
      const [bu, bt] = b.split(".").map(Number);
      return au - bu || at - bt;
    }),
    [byTopic],
  );
  const topicsInUnit = topics.filter((t) => t.split(".")[0] === unit);

  const start = (topic: string) => {
    const list = [...(byTopic.get(topic) ?? [])].sort((a, b) => a.id - b.id);
    setOpen({ topic, list });
    setIdx(0);
    setShown(false);
    setPicked(null);
  };

  const markDone = (id: number) => {
    const next = { ...done, [String(id)]: true };
    setDone(next);
    try { localStorage.setItem(DONE_KEY, JSON.stringify(next)); } catch { /* 忽略 */ }
  };

  if (error) {
    return (
      <main className="duo flex-1 flex items-center justify-center px-4 py-10">
        <div className="duo-card p-8 max-w-lg text-center">
          <p className="font-extrabold text-red-600 mb-2">加载失败</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={onBack} className="btn-duo btn-duo-outline mt-6">返回</button>
        </div>
      </main>
    );
  }

  // ---------- 练习视图 ----------
  if (open) {
    const q = open.list[idx];
    const total = open.list.length;
    const doneN = open.list.filter((r) => done[String(r.id)]).length;
    return (
      <main className="duo flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setOpen(null)} className="btn-duo btn-duo-outline !py-1.5 !px-4 text-sm">← 返回</button>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-sm truncate">
              {open.topic} {TOPICS[open.topic]?.name ?? ""}
            </div>
            <div className="text-xs font-bold text-gray-400">
              {idx + 1} / {total} · 已完成 {doneN}
            </div>
          </div>
        </div>

        <div className="h-3 rounded-full bg-gray-200 overflow-hidden mb-4">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>

        <div className="duo-card p-5 mb-4">
          <p className="text-xs font-bold text-gray-400 mb-3">
            {q.book_chapter} · 第 {q.number} 题{q.needs_review ? " · 分类待复核" : ""}
          </p>
          <Md>{fix(q.prompt)}</Md>
        </div>

        <div className="space-y-2 mb-4">
          {q.choices.map((c) => {
            const isAnswer = shown && q.answer === c.label;
            const isWrong = shown && picked === c.label && q.answer !== c.label;
            return (
              <button
                key={c.label}
                onClick={() => { if (!shown) setPicked(c.label); }}
                className={`duo-pick w-full text-left p-3 rounded-xl border-2 font-bold ${
                  isAnswer ? "duo-right" : isWrong ? "duo-wrong" : "border-gray-200 bg-white"
                }`}
              >
                <span className="inline-block w-6 font-extrabold text-gray-500">{c.label}</span>
                <span className="exam-serif"><Md>{fix(c.text)}</Md></span>
              </button>
            );
          })}
        </div>

        {shown && q.explanation && (
          <div className="duo-card p-5 mb-4 bg-green-50 border-green-300">
            <p className="text-xs font-bold text-green-700 mb-2">解析</p>
            <Md>{fix(q.explanation)}</Md>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            disabled={idx === 0}
            onClick={() => { setIdx(idx - 1); setShown(false); setPicked(null); }}
            className="btn-duo btn-duo-outline disabled:opacity-40"
          >
            上一题
          </button>
          {!shown ? (
            <button
              onClick={() => { setShown(true); markDone(q.id); }}
              className="btn-duo btn-duo-primary flex-1"
            >
              看答案
            </button>
          ) : idx === total - 1 ? (
            <button onClick={() => setOpen(null)} className="btn-duo btn-duo-primary flex-1">完成本节</button>
          ) : (
            <button
              onClick={() => { setIdx(idx + 1); setShown(false); setPicked(null); }}
              className="btn-duo btn-duo-primary flex-1"
            >
              下一题
            </button>
          )}
        </div>
      </main>
    );
  }

  // ---------- 列表视图 ----------
  return (
    <main className="duo flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="btn-duo btn-duo-outline !py-1.5 !px-4 text-sm">← 返回</button>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-green-600">章节补充题库</h1>
          <p className="text-xs font-bold text-gray-400">
            {rows ? `${rows.length} 道选择题 · 按 AP topic 归类` : "加载中…"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(UNITS).map(([u, name]) => {
          const n = topics.filter((t) => t.split(".")[0] === u).reduce((a, t) => a + (byTopic.get(t)?.length ?? 0), 0);
          if (!n) return null;
          return (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold border-2 ${
                unit === u ? "bg-sky-500 text-white border-sky-500" : "border-gray-200 text-gray-500 bg-white"
              }`}
              title={name}
            >
              U{u} · {n}
            </button>
          );
        })}
      </div>

      <h2 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-3">
        Unit {unit} · {UNITS[Number(unit)]}
      </h2>

      <div className="space-y-2">
        {topicsInUnit.length === 0 && (
          <p className="text-sm font-bold text-gray-400">{rows ? "这个单元暂无题目" : "加载中…"}</p>
        )}
        {topicsInUnit.map((t) => {
          const list = byTopic.get(t) ?? [];
          const doneN = list.filter((r) => done[String(r.id)]).length;
          const pct = list.length ? Math.round((doneN / list.length) * 100) : 0;
          return (
            <button
              key={t}
              onClick={() => start(t)}
              className="duo-card w-full p-4 text-left hover:border-green-400 hover:-translate-y-0.5 transition"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-sm">
                    <span className="text-sky-600 mr-2">{t}</span>
                    {TOPICS[t]?.name ?? ""}
                  </div>
                  <div className="text-xs font-bold text-gray-400 mt-1">
                    {list.length} 题 · 已完成 {doneN}
                  </div>
                </div>
                <div className="shrink-0 w-11 h-11 rounded-full grid place-items-center text-xs font-extrabold"
                  style={{ background: `conic-gradient(#22c55e ${pct}%, #e5e7eb 0)` }}>
                  <span className="bg-white w-8 h-8 rounded-full grid place-items-center">{pct}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
