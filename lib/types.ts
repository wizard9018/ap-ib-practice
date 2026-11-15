export type Block = { type: "text"; text: string } | { type: "image"; src: string } | { type: "table"; rows: string[][] };
export type Choice = { label: string; content: Block[] };
export type Section = { id: string; type: "multiple_choice"; time_minutes: number; calculator: boolean; expected_questions: number; title: string; note: string; directions: string[] };
// what the student's browser gets: no answer key
export type PublicQuestion = { id: string; number: number; exam_order: number; section_id: string; prompt: Block[]; choices: Choice[] };
export type PublicExam = { id: string; subject: string; year: number; sections: Section[]; questions: PublicQuestion[] };
export type StoredExam = Omit<PublicExam, "questions"> & { questions: (PublicQuestion & { answer: { correct_choice: string } })[] };

export type Answer = { value: string; marked: boolean; eliminated?: string[] };
export type Answers = Record<string, Answer>;
// where the student is; `used` is the seconds spent in the open section, `usedDone` in the sections already submitted
export type ExamState = {
  sectionIndex: number; questionIndex: number; phase: "directions" | "test" | "review" | "between";
  used: number; usedDone: number; spent: Record<string, number>; savedAt: number;
};
export type Result = { correct: number; total: number; answered: number; items: { id: string; number: number; section_id: string; selected: string; correct: string; isCorrect: boolean }[] };
export type Attempt = {
  id: string; exam_id: string; mode: "mock" | "practice"; status: "in_progress" | "submitted"; answers: Answers; exam_state: ExamState;
  result: Result | null; started_at: string; submitted_at: string | null; updated_at: string;
};
