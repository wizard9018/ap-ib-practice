"use client";

import { useCallback, useEffect, useState } from "react";
import { api, supabase } from "@/lib/browser";
import type { Answers, Attempt, ExamState, PublicExam, Result } from "@/lib/types";
import Login from "./Login";
import Runner, { type Exam } from "./Runner";
import IbPractice from "./IbPractice";

// the API sends sections as a list with time_minutes; the runner reads them by id
function toRunnerExam(e: PublicExam): Exam {
  return {
    exam: `${e.year} ${e.subject}`,
    sections: Object.fromEntries(e.sections.map((s) => [s.id, { title: s.title, minutes: s.time_minutes, calculator: s.calculator, directions: s.directions, note: s.note }])),
    questions: e.questions.map((q) => ({ id: q.id, number: q.number, section: q.section_id, prompt: q.prompt, choices: q.choices })),
  };
}

export default function App() {
  const [mode, setMode] = useState<"home" | "ap" | "ib">("home");
  const [homeEmail, setHomeEmail] = useState<string | null>(null);
  const [homeLogin, setHomeLogin] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setHomeEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setHomeEmail(session?.user.email ?? null); if (session) setHomeLogin(false); });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (homeLogin) return (<><button onClick={() => setHomeLogin(false)} className="absolute left-4 top-4 text-sm text-blue-700 hover:underline">← Back</button><Login onSignedIn={() => setHomeLogin(false)} /></>);
  if (mode === "ib") return <IbPractice onBack={() => setMode("home")} />;
  if (mode === "ap") return <ApExam />;
  return (
    <main className="duo flex-1 flex items-center justify-center px-4 py-10 relative">
      <div className="absolute right-4 top-3 text-sm font-bold text-gray-500 flex items-center gap-3">
        {homeEmail ? (<><span>{homeEmail}</span><button onClick={() => void supabase.auth.signOut()} className="text-sky-600 hover:underline">Sign out</button></>)
          : <button onClick={() => setHomeLogin(true)} className="btn-duo btn-duo-primary !py-1.5 !px-4 text-sm">Sign in</button>}
      </div>
      <div className="max-w-xl w-full text-center">
        <h1 className="text-4xl font-extrabold text-green-600 mb-1">AP / IB Practice</h1>
        <p className="font-bold text-gray-400 mb-8">Choose a question bank</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => setMode("ap")} className="duo-card hover:-translate-y-1 hover:border-sky-300 p-6 text-left">
            <span className="block text-2xl font-extrabold text-sky-600">AP</span>
            <span className="text-sm font-bold text-gray-500">Calculus AB timed mock exam (sign in required)</span>
          </button>
          <button onClick={() => setMode("ib")} className="duo-card hover:-translate-y-1 hover:border-green-300 p-6 text-left">
            <span className="block text-2xl font-extrabold text-green-600">IB</span>
            <span className="text-sm font-bold text-gray-500">Math AA, Physics, Chemistry, Biology and Economics (HL), practice by topic</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function ApExam() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<{ attempt: Attempt; exam: Exam } | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { setPhase("login"); return; }
    setEmail(s.session.user.email ?? "");
    try {
      const r = await api<{ attempt: Attempt; exam: PublicExam }>("/api/attempts", { method: "POST" });
      setData({ attempt: r.attempt, exam: toRunnerExam(r.exam) });
      setPhase("ready");
    } catch (e) { setError((e as Error).message); setPhase("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (phase === "loading") return <main className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</main>;
  if (phase === "login") return <Login onSignedIn={() => void load()} />;
  if (phase === "error" || !data) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-red-600">{error || "Failed to load"}</p>
        <button onClick={() => void load()} className="rounded-full bg-blue-600 text-white font-semibold px-6 py-2">Retry</button>
      </main>
    );
  }
  return (
    <Runner
      exam={data.exam}
      attempt={data.attempt}
      email={email}
      onSignOut={async () => { await supabase.auth.signOut(); setData(null); setPhase("login"); }}
      onSave={async (answers: Answers, exam_state: ExamState) => { await api(`/api/attempts/${data.attempt.id}`, { method: "PATCH", body: JSON.stringify({ answers, exam_state }) }); }}
      onSubmit={() => api<Result>(`/api/attempts/${data.attempt.id}/submit`, { method: "POST" })}
    />
  );
}
