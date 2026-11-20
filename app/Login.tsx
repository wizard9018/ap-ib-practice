"use client";

import { useState } from "react";
import { supabase } from "@/lib/browser";

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage("Sign-in failed: incorrect email or password."); else onSignedIn();
  }
  async function guest() {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: "guest@guest.apib.app", password: "guest-ap-ib-2026" });
    setBusy(false);
    if (error) setMessage("Guest sign-in failed. Please try again."); else onSignedIn();
  }
  async function google() {
    setBusy(true); setMessage(null);
    // Supabase answers a disabled provider with a bare JSON error page, so ask first
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
    const enabled = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim() } }).then((r) => r.json()).then((d) => Boolean(d?.external?.google)).catch(() => false);
    if (!enabled) { setBusy(false); setMessage("Google sign-in is not set up yet. Please use your email."); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { setBusy(false); setMessage("Google sign-in failed. Please try again or use your email."); }   // on success the browser leaves for Google
  }
  async function signUp() {
    setBusy(true); setMessage(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(`Sign-up failed: ${error.message}`);
    else if (data.session) onSignedIn();
    else setMessage("Account created. Check your email for the confirmation link, then come back and sign in.");
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <form onSubmit={(e) => { e.preventDefault(); void signIn(); }} className="max-w-sm w-full border border-gray-200 rounded-2xl p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-700">AP / IB PRACTICE</p>
        <h1 className="text-2xl font-bold mt-1 mb-6">Sign in</h1>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4" autoComplete="email" />
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4" autoComplete="current-password" />
        {message && <p className="text-sm text-red-600 mb-3">{message}</p>}
        <button type="button" disabled={busy} onClick={() => void google()} className="w-full mb-4 rounded-full border border-gray-300 text-gray-800 font-semibold py-3 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.1 7-10.2 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>
        <p className="text-center text-xs text-gray-400 mb-4">or use email</p>
        <button disabled={busy} className="w-full rounded-full bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 disabled:opacity-50">Sign in</button>
        <button type="button" disabled={busy || !email || password.length < 6} onClick={() => void signUp()} className="w-full mt-3 rounded-full border border-gray-300 text-gray-700 font-semibold py-3 hover:bg-gray-50 disabled:opacity-50">Create account</button>
        <button type="button" disabled={busy} onClick={() => void guest()} className="w-full mt-3 rounded-full text-gray-600 font-semibold py-3 hover:bg-gray-50 disabled:opacity-50">Continue as guest</button>
      </form>
    </main>
  );
}
