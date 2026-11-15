import type { Answers, ExamState, PublicExam, Result, StoredExam } from "./types";

export function grade(exam: StoredExam, answers: Answers): Result {
  const items = exam.questions.map((q) => ({
    id: q.id, number: q.number, section_id: q.section_id,
    selected: answers[q.id]?.value ?? "", correct: q.answer.correct_choice, isCorrect: answers[q.id]?.value === q.answer.correct_choice,
  }));
  return { correct: items.filter((i) => i.isCorrect).length, answered: items.filter((i) => i.selected).length, total: items.length, items };
}

export const initialState = (): ExamState => ({ sectionIndex: 0, questionIndex: 0, phase: "directions", used: 0, usedDone: 0, spent: {}, savedAt: Date.now() });

// The server decides what a save may change: sections only move forward, a mock section cannot run over its time,
// and only the open section's answers can be edited (a submitted section is locked).
export function validateSave(exam: PublicExam, old: ExamState, state: ExamState, before: Answers, after: Answers) {
  if (!Number.isInteger(state.sectionIndex) || state.sectionIndex < old.sectionIndex || state.sectionIndex > old.sectionIndex + 1 || state.sectionIndex >= exam.sections.length) throw new Error("Invalid section order. Please refresh and continue.");
  const current = exam.sections[state.sectionIndex];
  const inSection = exam.questions.filter((q) => q.section_id === current.id);
  if (!["directions", "test", "review", "between"].includes(state.phase)) throw new Error("Invalid exam state.");
  if (!Number.isInteger(state.questionIndex) || state.questionIndex < 0 || state.questionIndex >= inSection.length) throw new Error("Invalid exam state.");
  if (![state.used, state.usedDone, state.savedAt].every(Number.isFinite) || state.used < 0 || state.usedDone < 0) throw new Error("Invalid exam state.");
  if (state.sectionIndex === old.sectionIndex && state.used + 2 < old.used) throw new Error("This save is out of date. Please refresh and continue.");
  if (state.used > current.time_minutes * 60 + 5) throw new Error("Time limit for this section exceeded.");
  const labels = (id: string) => exam.questions.find((q) => q.id === id)?.choices.map((c) => c.label) ?? [];
  for (const [id, answer] of Object.entries(after)) {
    if (!exam.questions.some((q) => q.id === id) || typeof answer.value !== "string" || typeof answer.marked !== "boolean") throw new Error("Invalid answer format.");
    if (answer.value && !labels(id).includes(answer.value)) throw new Error("Invalid choice.");
    if (answer.eliminated !== undefined && (!Array.isArray(answer.eliminated) || answer.eliminated.some((v) => !labels(id).includes(v)))) throw new Error("Invalid eliminated choice.");
  }
  const sig = (a: Answers[string] | undefined) => JSON.stringify([a?.value ?? "", a?.marked ?? false, [...(a?.eliminated ?? [])].sort()]);
  const open = exam.sections[old.sectionIndex].id;
  for (const q of exam.questions) {
    if (q.section_id !== open && sig(before[q.id]) !== sig(after[q.id])) throw new Error("Only the current section's answers can be changed.");
  }
}
