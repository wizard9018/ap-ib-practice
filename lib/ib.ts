import { supabase } from "./browser";

// Offered subjects: a subject slug, or a group_key (Physics = HL plus the 15 questions only SL has). (Math AA SL is entirely a subset of HL, so HL alone covers it.)
export const IB_GROUPS = [
  { key: "ib-mathematics-aa-hl", label: "Mathematics AA HL" },
  { key: "ib-physics", label: "Physics HL" },
  { key: "ib-chemistry-hl", label: "Chemistry HL" },
  { key: "ib-biology-hl", label: "Biology HL" },
  { key: "ib-economics-hl", label: "Economics HL" },
] as const;

export type IbMeta = { ref: string; subject_slug: string; topic: string; subtopic: string };
export type ChoiceItem = { part: string; stem: string; options: Record<"A" | "B" | "C" | "D", string>; correct: "A" | "B" | "C" | "D" };
export type IbQuestion = IbMeta & { choices?: ChoiceItem[]; body: string; mark_scheme: string | null; difficulty: string | null; marks: number | null; paper: string | null; calculator: boolean | null };

const PAGE = 1000;
const hlFirst = (a: { subject_slug: string }, b: { subject_slug: string }) => Number(b.subject_slug.endsWith("-hl")) - Number(a.subject_slug.endsWith("-hl"));

async function subjectsOf(group: string) {
  const { data, error } = await supabase.from("subjects").select("slug,name").or(`slug.eq.${group},group_key.eq.${group}`);
  if (error || !data?.length) throw new Error("Could not load IB subjects.");
  return data;
}

// one row per ref (a ref in both HL and SL is the same question), HL first so its image folder wins
export async function loadTree(group: string): Promise<{ metas: IbMeta[]; names: Record<string, string> }> {
  const subjects = await subjectsOf(group);
  const slugs = subjects.map((s) => s.slug);
  const rows: IbMeta[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("questions").select("ref,subject_slug,topic,subtopic").in("subject_slug", slugs).order("topic").order("subtopic").order("ref").range(from, from + PAGE - 1);
    if (error) throw new Error("Could not load IB questions.");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  const seen = new Set<string>();
  const metas = rows.sort(hlFirst).filter((r) => !seen.has(r.ref) && seen.add(r.ref));
  return { metas, names: Object.fromEntries(subjects.map((s) => [s.slug, s.name])) };
}

export async function loadQuestions(topic: string, subtopic: string, names: Record<string, string>): Promise<IbQuestion[]> {
  const { data, error } = await supabase.from("questions").select("ref,subject_slug,topic,subtopic,body,mark_scheme,difficulty,marks,paper,calculator")
    .in("subject_slug", Object.keys(names)).eq("topic", topic).eq("subtopic", subtopic).order("ref");
  if (error) throw new Error("Could not load questions.");
  const seen = new Set<string>();
  const choices = await loadChoices((data as IbQuestion[]).map((q) => q.ref));
  return (data as IbQuestion[]).sort(hlFirst).filter((q) => !seen.has(q.ref) && seen.add(q.ref)).sort((a, b) => a.ref.localeCompare(b.ref))
    .map((q) => ({ ...q, choices: choices.get(q.ref), body: withImages(q.body, names[q.subject_slug], q.topic, q.subtopic), mark_scheme: q.mark_scheme && withImages(q.mark_scheme, names[q.subject_slug], q.topic, q.subtopic) }));
}

// markdown holds relative `images/…` paths; Storage keeps them under <subject name>/<topic>/<subtopic>/images/
// KaTeX allows one \tag per formula and the mark schemes put one on every line of an aligned block (M1/A1 marks):
// turn them into plain text at the end of the line
const fixMath = (md: string) => md.replace(/\\tag\*?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g, "\\quad $1");

function withImages(md: string, subjectName: string, topic: string, subtopic: string) {
  md = fixMath(md);
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()}/storage/v1/object/public/questions/${encodeURI(`${subjectName}/${topic}/${subtopic}/images/`)}`;
  // every raster image has a WebP copy next to it (<name>.webp); vector images are used as they are
  const url = (name: string) => `](${base}${encodeURI(/\.svg$/i.test(name) ? name : `${name}.webp`).replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  return md.replace(/\]\(<images\/([^>]+)>\)/g, (_, n) => url(n)).replace(/\]\(images\/([^)\s]+)\)/g, (_, n) => url(n));
}

// ---- the student's record, one `progress` row per user + subject + topic + subtopic (RLS: own rows only)
// 1 = answer viewed; for written-answer questions the student's own mark: c = correct, p = partly, w = wrong
export type Mark = 1 | "c" | "p" | "w";
export type Done = Record<string, Record<string, Mark>>;


export async function fetchProgress(): Promise<Done> {
  const { data, error } = await supabase.from("progress").select("subject_key,done_refs");
  if (error) throw new Error("Could not load your saved progress.");
  const out: Done = {};
  for (const r of data ?? []) out[r.subject_key] = { ...out[r.subject_key], ...(r.done_refs as Record<string, Mark>) };
  return out;
}

// writes marks into the row of one subtopic (read, merge, write: questions are only ever added or re-marked)
export async function saveProgress(group: string, topic: string, subtopic: string, marks: Record<string, Mark>) {
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user.id;
  if (!user) return;
  const { data: rows, error } = await supabase.from("progress").select("id,done_refs").eq("user_id", user).eq("subject_key", group).eq("topic", topic).eq("subtopic", subtopic).order("id");
  if (error) throw new Error("save");
  const merged: Record<string, Mark> = { ...Object.assign({}, ...(rows ?? []).map((r) => r.done_refs)), ...marks };
  const stamp = { done_refs: merged, updated_at: new Date().toISOString() };
  const res = rows?.length
    ? await supabase.from("progress").update(stamp).eq("id", rows[0].id)
    : await supabase.from("progress").insert({ user_id: user, subject_key: group, topic, subtopic, flagged_refs: {}, ...stamp });
  if (res.error) throw new Error("save");
}

// ---- display order: the IB syllabus order (the database only has alphabetical order). Anything not listed goes last, "Unassigned" at the very end.
const ORDER: Record<string, { topics: string[]; subs: Record<string, string[]> }> = {
  "ib-mathematics-aa-hl": {
    topics: ["Number & Algebra", "Functions", "Geometry & Trigonometry", "Statistics & Probability", "Calculus I", "Calculus II"],
    subs: {
      "Number & Algebra": ["Exponents & Logarithms", "Sequences & Series", "Financial and Growth Models", "The Binomial Theorem", "Counting Principles", "Systems of Linear Equations", "Complex Numbers- Algebraic Operations", "Complex Numbers- Geometric Representations", "Proof by Deduction, Contradiction, and Counterexample", "Proof by Induction- Series, Divisibility, and Inequalities", "Proof by Induction- Differentiation & Integration"],
      Functions: ["Linear and Quadratic Functions", "Composite & Inverse Functions", "Transformations", "Polynomials", "Rational Functions", "Exponential and Logarithmic Functions", "Modulus Equations and Functions"],
      "Geometry & Trigonometry": ["Triangle Geometry", "Circle Geometry", "Trigonometric Functions & Graphs", "Trigonometric Identities & Equations", "Vectors, Points & Lines", "Vectors & Planes", "Mixed Geometry"],
      "Statistics & Probability": ["Descriptive Statistics", "Bivariate Statistics", "Probability", "Discrete Random Variables", "The Binomial Distribution", "Continuous Random Variables", "The Normal Distribution"],
      "Calculus I": ["Differentiation Fundamentals", "Trigonometric Differentiation", "Implicit Differentiation", "Related Rates of Change", "Optimization", "Kinematics I- Differentiation", "L'Hopital's Rule"],
      "Calculus II": ["Integration Fundamentals and Areas", "Integration by Parts and by Substitution", "Trigonometric Integration", "Volumes of Revolution", "Kinematics II- Integration and Mixed", "Differential Equations", "Maclaurin Series"],
    },
  },
  "ib-physics": {
    topics: ["Space, Time, and Motion", "The Particulate Nature of Matter", "Wave Behaviour", "Fields", "Nuclear & Quantum Physics", "Scientific Skills & Tools"],
    subs: {
      "Space, Time, and Motion": ["Kinematics", "Forces & Momentum", "Work, Energy, and Power", "Rotational Mechanics", "Special Relativity"],
      "The Particulate Nature of Matter": ["Thermal Energy Transfers", "Greenhouse Effect", "Ideal Gas Model", "Thermodynamics", "Electric Circuits"],
      "Wave Behaviour": ["Simple Harmonic Motion", "Travelling Waves", "Refraction, Diffraction, Superposition, and Interference", "Standing Waves & Resonance", "Doppler Effect"],
      Fields: ["Gravitational Fields & Potential", "Electromagnetic Fields & Potential", "Motion in Electromagnetic Fields", "Electromagnetic Induction"],
      "Nuclear & Quantum Physics": ["Atomic Structure", "Quantum Physics", "Radioactive Decay", "Nuclear Fission", "Stellar Properties & Processes"],
    },
  },
  "ib-chemistry-hl": {
    topics: ["Models of the Particulate Nature of Matter", "Models of Bonding & Structure", "Classification of Matter", "What Drives Chemical Reactions-", "How Much, How Fast & How Far-", "Mechanisms of Chemical Change", "Tools & Inquiries"],
    subs: {
      "Models of the Particulate Nature of Matter": ["Introduction to the Particulate Nature of Matter", "The Nuclear Atom", "Electron Configurations", "The Mole", "Ideal Gases"],
      "Models of Bonding & Structure": ["The Ionic Model", "The Covalent Model", "The Metallic Model", "From Models to Materials"],
      "Classification of Matter": ["The Periodic Table - Classification of Elements", "Functional Groups - Classification of Organic Compounds"],
      "What Drives Chemical Reactions-": ["Measuring Enthalpy Changes", "Energy Cycles in Reactions", "Energy From Fuels", "Entropy & Spontaneity"],
      "How Much, How Fast & How Far-": ["The Amount of Chemical Change", "The Rate of Chemical Change", "The Extent of Chemical Change"],
      "Mechanisms of Chemical Change": ["Proton Transfer Reactions", "Electron Transfer Reactions", "Electron Sharing Reactions", "Electron-pair Sharing Reactions"],
      "Tools & Inquiries": ["Experimental Techniques", "Collecting & Processing Data", "Mathematics Tools", "Concluding & Evaluating"],
    },
  },
  "ib-biology-hl": {
    topics: ["Unity & Diversity", "Form & Function", "Interaction & Interdependence", "Continuity & Change", "Practical-based and Extended Response Questions"],
    subs: {
      "Unity & Diversity": ["Water", "Nucleic Acids", "Origin of Cells", "Cell Structure", "Viruses", "Diversity of Organisms", "Classification & Cladistics", "Evolution & Speciation", "Conservation of Biodiversity"],
      "Form & Function": ["Carbohydrates & Lipids", "Proteins", "Membranes & Membrane Transport", "Organelles & Compartmentalization", "Cell Specialization", "Gas Exchange", "Transport", "Muscle & Motility", "Adaptation to Environment", "Ecological Niches"],
      "Interaction & Interdependence": ["Enzymes & Metabolism", "Cell Respiration", "Photosynthesis", "Chemical Signalling", "Neural Signalling", "Integration of Body Systems", "Defence Against Disease", "Populations & Communities", "Transfers of Energy & Matter"],
      "Continuity & Change": ["DNA Replication", "Protein Synthesis", "Mutations & Gene Editing", "Cell & Nuclear Division", "Gene Expression", "Water Potential", "Reproduction", "Inheritance", "Homeostasis", "Natural Selection", "Climate Change", "Stability & Change"],
      "Practical-based and Extended Response Questions": ["Practical-based Questions", "Extended Response Questions"],
    },
  },
  "ib-economics-hl": {
    topics: ["Foundations", "Microeconomics I"],
    subs: { Foundations: ["How Economists Approach the World", "Scarcity, Choice, and the PPC"], "Microeconomics I": ["Demand & Supply, Equilibrium", "Elasticities", "Behavioural Economics"] },
  },
};

const rank = (list: string[] | undefined, name: string) => (name === "Unassigned" ? 2e6 : list?.includes(name) ? list.indexOf(name) : 1e6);
const byOrder = (list: string[] | undefined) => (a: string, b: string) => rank(list, a) - rank(list, b) || a.localeCompare(b);
export const sortTopics = (group: string, names: string[]) => [...names].sort(byOrder(ORDER[group]?.topics));
export const sortSubtopics = (group: string, topic: string, names: string[]) => [...names].sort(byOrder(ORDER[group]?.subs[topic]));

// multiple-choice versions of written questions (table ib_choices); without the table or rows the question simply has none
async function loadChoices(refs: string[]): Promise<Map<string, ChoiceItem[]>> {
  const out = new Map<string, ChoiceItem[]>();
  const { data, error } = await supabase.from("ib_choices").select("ref,part,stem,options,correct").in("ref", refs).order("part");
  if (error) return out;
  for (const r of data ?? []) out.set(r.ref, [...(out.get(r.ref) ?? []), { part: r.part, stem: r.stem, options: r.options, correct: r.correct }]);
  return out;
}
