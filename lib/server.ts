import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Attempt, PublicExam, StoredExam } from "./types";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

// Every write goes through the service role, after the caller's login and the ownership of the attempt were checked here.
export function admin() {
  if (!configured()) throw new ApiError(503, "Supabase keys are not configured.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function userId(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiError(401, "Please sign in to continue.");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "Your session has expired. Please sign in again.");
  return data.user.id;
}

// The exam with its answer key, for grading. (The 2008 mini exam is kept unpublished so the older site that shares this project does not list it.)
export async function loadExam(id: string): Promise<StoredExam> {
  const db = admin();
  const { data: exam, error } = await db.from("ap_exams").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError(503, "The database is not ready.");
  if (!exam) throw new ApiError(404, "Exam not found.");
  const { data: questions, error: qe } = await db.from("ap_questions").select("id,content").eq("exam_id", id).order("exam_order");
  if (qe || !questions?.length) throw new ApiError(503, "The exam questions have not been imported.");
  const { data: keys, error: ke } = await db.from("ap_answer_keys").select("question_id,content").in("question_id", questions.map((q) => q.id));
  if (ke || keys?.length !== questions.length) throw new ApiError(503, "The answer key is incomplete. Please re-import.");
  const answerMap = new Map(keys.map((k) => [k.question_id, k.content]));
  return { ...exam, questions: questions.map((q) => ({ ...q.content, answer: answerMap.get(q.id) })) };
}

export function publicExam(exam: StoredExam): PublicExam {
  return { id: exam.id, subject: exam.subject, year: exam.year, sections: exam.sections, questions: exam.questions.map(({ answer: _answer, ...q }) => q) };
}

export async function ownedAttempt(id: string, owner: string): Promise<Attempt> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Attempt not found.");
  const { data, error } = await admin().from("ap_attempts").select("*").eq("id", id).eq("user_id", owner).maybeSingle();
  if (error) throw new ApiError(503, "Could not load the attempt. Please try again later.");
  if (!data) throw new ApiError(404, "Attempt not found.");
  return data;
}

export function failure(error: unknown) {
  return Response.json({ error: error instanceof ApiError ? error.message : "Something went wrong. Please try again later." }, { status: error instanceof ApiError ? error.status : 500 });
}
