import { admin, ApiError, failure, loadExam, publicExam, userId } from "@/lib/server";
import { initialState } from "@/lib/grading";

const DEFAULT_EXAM_ID = "calculus-ab-2008";

// The student's open attempt for this exam (created on first use), plus the exam without its answer key.
// The body may name an exam ({ exam_id }); only the mock exams are allowed (the Calculus AB one, and the SSAT tests).
export async function POST(request: Request) {
  try {
    const owner = await userId(request);
    const requested = ((await request.json().catch(() => ({}))) as { exam_id?: unknown }).exam_id;
    const EXAM_ID = requested === undefined ? DEFAULT_EXAM_ID : requested;
    if (typeof EXAM_ID !== "string" || (EXAM_ID !== DEFAULT_EXAM_ID && !/^ssat-[a-z0-9-]+$/.test(EXAM_ID))) throw new ApiError(404, "Exam not found.");
    const exam = publicExam(await loadExam(EXAM_ID));
    const client = admin();
    const find = () => client.from("ap_attempts").select("*").eq("user_id", owner).eq("exam_id", EXAM_ID).eq("mode", "mock").eq("status", "in_progress").maybeSingle();
    const { data: existing, error: readError } = await find();
    if (readError) throw readError;
    if (existing) return Response.json({ attempt: existing, exam });
    const now = new Date().toISOString();
    const { data, error } = await client.from("ap_attempts")
      .insert({ user_id: owner, exam_id: EXAM_ID, mode: "mock", status: "in_progress", answers: {}, exam_state: initialState(), result: null, started_at: now, updated_at: now })
      .select().single();
    if (error?.code === "23505") { const { data: retry } = await find(); if (retry) return Response.json({ attempt: retry, exam }); }   // two tabs started at once
    if (error) throw error;
    return Response.json({ attempt: data, exam });
  } catch (e) { return failure(e instanceof ApiError ? e : e); }
}
