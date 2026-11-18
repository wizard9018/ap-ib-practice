// Estimated SSAT Upper Level scaled scores (500-800 per section, 1500-2400 total) from raw scores.
// Source: the SSAT's own "What Will My SSAT Score Be?" page (admission.org/practice/ul-what-will-my-ssat-score-be),
// "Upper Level Estimated SSAT Scaled Scores". The real conversion differs a little from test form to test form
// (equating) and is not published, so these are estimates only. Raw score = right - wrong/4; unanswered count 0.
// Quantitative is one raw score over both math sections (max 50), Verbal max 60, Reading max 40.

export type SsatSection = "Verbal" | "Quantitative" | "Reading";

// [raw, verbal, quantitative, reading]; null = above the section's maximum raw score
const TABLE: [number, number | null, number | null, number | null][] = [
  [60, 800, null, null],
  [55, 800, null, null],
  [50, 791, 800, null],
  [45, 767, 791, null],
  [40, 740, 764, 800],
  [35, 716, 740, 746],
  [30, 692, 716, 710],
  [25, 668, 692, 680],
  [20, 641, 668, 650],
  [15, 614, 641, 620],
  [10, 587, 611, 587],
  [5, 557, 578, 554],
  [0, 524, 545, 521],
  [-5, 500, 512, 503],
];

// Median (50th percentile) Upper Level scaled scores by grade, from Ivy Global's "SSAT Percentiles" page (third-party, year not stated;
// the SSAT itself does not publish them). The comparison group is same-grade students from the past three years.
export const MEDIANS: Record<SsatSection, Record<8 | 9 | 10, number>> = {
  Verbal: { 8: 662, 9: 683, 10: 695 },
  Quantitative: { 8: 647, 9: 668, 10: 686 },
  Reading: { 8: 629, 9: 644, 10: 656 },
};
export const MEDIAN_GRADES = [8, 9, 10] as const;
export const medianTotal = (grade: 8 | 9 | 10) => MEDIANS.Verbal[grade] + MEDIANS.Quantitative[grade] + MEDIANS.Reading[grade];

const COLUMN: Record<SsatSection, 1 | 2 | 3> = { Verbal: 1, Quantitative: 2, Reading: 3 };

export function ssatRawScore(right: number, wrong: number): number {
  return right - wrong / 4;
}

export function ssatScaledScore(section: SsatSection, raw: number): number {
  const col = COLUMN[section];
  // rows that exist for this section, highest raw first
  const rows = TABLE.filter((r) => r[col] !== null).map((r) => [r[0], r[col] as number] as const);
  if (raw >= rows[0][0]) return 800;
  const last = rows[rows.length - 1];
  if (raw <= last[0]) return Math.max(500, last[1]);
  for (let i = 0; i < rows.length - 1; i++) {
    const [hiRaw, hiScaled] = rows[i];
    const [loRaw, loScaled] = rows[i + 1];
    if (raw <= hiRaw && raw >= loRaw) {
      return Math.round(loScaled + ((raw - loRaw) / (hiRaw - loRaw)) * (hiScaled - loScaled));
    }
  }
  return 500;
}

export function ssatSectionOf(categoryname: string | null | undefined): SsatSection | null {
  if (!categoryname) return null;
  if (categoryname.startsWith("Verbal")) return "Verbal";
  if (categoryname.startsWith("Quantitative")) return "Quantitative";
  if (categoryname.startsWith("Reading")) return "Reading";
  return null;
}
