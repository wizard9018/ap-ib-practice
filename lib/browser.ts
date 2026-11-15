"use client";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim());

// calls our own API with the student's access token
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  if (!response.ok) {
    let message = "Request failed. Please try again.";
    try { message = (await response.json()).error ?? message; } catch { /* keep the default */ }
    throw new Error(message);
  }
  return response.json();
}
