import { admin, ApiError, failure, loadExam, ownedAttempt, userId } from "@/lib/server";
import { grade } from "@/lib/grading";

// Grades on the server and only now sends the correct answers back.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await userId(request);
    const old = await ownedAttempt((await context.params).id, owner);
    if (old.status === "submitted") return Response.json(old.result);
    const exam = await loadExam(old.exam_id);
    if (old.exam_state.sectionIndex !== exam.sections.length - 1) throw new ApiError(409, "Please finish all sections first.");
    const result = grade(exam, old.answers);
    const now = new Date().toISOString();
    const { data, error } = await admin().from("ap_attempts")
      .update({ status: "submitted", result, submitted_at: now, updated_at: now })
      .eq("id", old.id).eq("user_id", owner).eq("updated_at", old.updated_at).eq("status", "in_progress").select().maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(409, "The attempt was updated. Please refresh and submit.");
    return Response.json(data.result);
  } catch (e) { return failure(e); }
}
