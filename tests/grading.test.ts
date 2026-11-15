import assert from "node:assert/strict";
import test from "node:test";
import { grade, validateSave } from "../lib/grading.ts";
import type { ExamState, PublicExam, StoredExam } from "../lib/types.ts";

const sections = [
  { id: "A", type: "multiple_choice" as const, time_minutes: 55, calculator: false, expected_questions: 2, title: "Part A", note: "", directions: [] },
  { id: "B", type: "multiple_choice" as const, time_minutes: 50, calculator: true, expected_questions: 1, title: "Part B", note: "", directions: [] },
];
const choice = (label: string) => ({ label, content: [] });
const q = (id: string, section_id: string, n: number, correct: string) =>
  ({ id, number: n, exam_order: n, section_id, prompt: [], choices: ["A", "B", "C", "D", "E"].map(choice), answer: { correct_choice: correct } });
const stored: StoredExam = { id: "e", subject: "s", year: 2008, sections, questions: [q("a1", "A", 1, "C"), q("a2", "A", 2, "B"), q("b1", "B", 3, "E")] };
const pub: PublicExam = { ...stored, questions: stored.questions.map(({ answer: _a, ...rest }) => rest) };
const state = (over: Partial<ExamState> = {}): ExamState => ({ sectionIndex: 0, questionIndex: 0, phase: "test", used: 10, usedDone: 0, spent: {}, savedAt: 1, ...over });

test("grade counts only the matching choices", () => {
  const r = grade(stored, { a1: { value: "C", marked: false }, a2: { value: "A", marked: true }, b1: { value: "", marked: false } });
  assert.equal(r.correct, 1); assert.equal(r.answered, 2); assert.equal(r.total, 3);
});

test("an answer in the open section can be saved", () => {
  validateSave(pub, state(), state({ used: 20 }), {}, { a1: { value: "C", marked: false } });
});

test("a submitted section is locked", () => {
  const before = { a1: { value: "C", marked: false } };
  assert.throws(() => validateSave(pub, state({ sectionIndex: 1, phase: "test" }), state({ sectionIndex: 1 }), before, { a1: { value: "D", marked: false } }), /当前分节/);
});

test("sections only move forward, one at a time", () => {
  validateSave(pub, state(), state({ sectionIndex: 1, phase: "directions", used: 0 }), {}, {});
  assert.throws(() => validateSave(pub, state({ sectionIndex: 1 }), state({ sectionIndex: 0 }), {}, {}), /分节顺序/);
  assert.throws(() => validateSave(pub, state(), state({ sectionIndex: 2 }), {}, {}), /分节顺序/);
});

test("a section cannot run past its time limit, and the clock cannot go back", () => {
  assert.throws(() => validateSave(pub, state(), state({ used: 55 * 60 + 6 }), {}, {}), /超出限制/);
  assert.throws(() => validateSave(pub, state({ used: 100 }), state({ used: 50 }), {}, {}), /过期/);
});

test("unknown questions and choices are refused", () => {
  assert.throws(() => validateSave(pub, state(), state(), {}, { zz: { value: "A", marked: false } }), /答案格式/);
  assert.throws(() => validateSave(pub, state(), state(), {}, { a1: { value: "Z", marked: false } }), /选项/);
});
