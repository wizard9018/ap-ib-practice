import { admin, ApiError, failure, loadExam, ownedAttempt, publicExam, userId } from "@/lib/server";
import { validateSave } from "@/lib/grading";

// Saves the answers and where the student is. The server checks the move is allowed (see validateSave).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await userId(request);
    const old = await ownedAttempt((await context.params).id, owner);
    if (old.status !== "in_progress") throw new ApiError(409, "This exam has already been submitted.");
    const body = await request.json();
    const exam = publicExam(await loadExam(old.exam_id));
    try { validateSave(exam, old.exam_state, body.exam_state, old.answers, body.answers); } catch (e) { throw new ApiError(409, (e as Error).message); }
    const { data, error } = await admin().from("ap_attempts")
      .update({ answers: body.answers, exam_state: body.exam_state, updated_at: new Date().toISOString() })
      .eq("id", old.id).eq("user_id", owner).eq("updated_at", old.updated_at).eq("status", "in_progress").select().maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(409, "Another device updated this attempt. Please refresh and continue.");
    return Response.json({ ok: true, updated_at: data.updated_at });
  } catch (e) { return failure(e); }
}
