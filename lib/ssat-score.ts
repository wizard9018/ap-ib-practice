// Estimated SSAT Upper Level scaled scores (500-800 per section, 1500-2400 total) from raw scores.
// Source: the SSAT's own "What Will My SSAT Score Be?" page (admission.org/practice/ul-what-will-my-ssat-score-be),
// "Upper Level Estimated SSAT Scaled Scores". The real conversion differs a little from test form to test form
// (equating) and is not published, so these are estimates only. Raw score = right - wrong/4; unanswered count 0.
// Quantitative is one raw score over both math sections (max 50), Verbal max 60, Reading max 40.

export type SsatSection = "Verbal" | "Quantitative" | "Reading";

// [raw, verbal, quantitative, reading]; null = above the section's maximum raw score
const UPPER_TABLE: [number, number | null, number | null, number | null][] = [
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

// Middle Level (440-710 per section, 1320-2130 total), from the SSAT's "What Will My SSAT Score Be?" page
// (admission.org/practice/ml-what-will-my-ssat-score-be), "Middle Level Estimated SSAT Scaled Scores".
const MIDDLE_TABLE: [number, number | null, number | null, number | null][] = [
  [60, 710, null, null],
  [55, 710, null, null],
  [50, 707, 710, null],
  [45, 695, 692, null],
  [40, 677, 674, 710],
  [35, 656, 656, 701],
  [30, 635, 638, 671],
  [25, 617, 619, 641],
  [20, 596, 599, 614],
  [15, 575, 578, 587],
  [10, 551, 554, 557],
  [5, 528, 530, 524],
  [0, 506, 506, 497],
  [-5, 479, 479, 458],
];
export type SsatLevel = "upper" | "middle" | "elementary";
export const ssatLevelOf = (examId: string): SsatLevel => (examId.startsWith("ssat-elementary-") ? "elementary" : examId.startsWith("ssat-middle-") ? "middle" : "upper");
// Elementary Level: no penalty for wrong answers; scaled 300-600 per section. The SSAT publishes no raw-to-scaled table for this level, so
// these "best approximation" charts (index = number correct) come from the practice book "2 Practice Tests for the SSAT Elementary - Third Grade".
const ELEMENTARY_CHART: Record<SsatSection, number[]> = {
  Verbal: [300, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 420, 430, 430, 440, 440, 450, 450, 460, 460, 470, 470, 480, 490, 500, 520, 540, 560, 580, 600],
  Quantitative: [300, 320, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 420, 430, 430, 440, 440, 450, 450, 460, 460, 470, 470, 480, 490, 500, 520, 540, 560, 580, 600],
  Reading: [300, 320, 340, 350, 360, 370, 380, 390, 400, 410, 410, 420, 420, 430, 430, 440, 440, 450, 450, 460, 470, 480, 490, 500, 520, 540, 560, 580, 600],
};
const TABLES = { upper: UPPER_TABLE, middle: MIDDLE_TABLE, elementary: UPPER_TABLE };
const FLOOR = { upper: 500, middle: 440, elementary: 300 };
const CEIL = { upper: 800, middle: 710, elementary: 600 };
export const SCORE_RANGE = { upper: { min: 1500, max: 2400, section: "500–800" }, middle: { min: 1320, max: 2130, section: "440–710" }, elementary: { min: 900, max: 1800, section: "300–600" } };

// Middle Level medians by grade (Ivy Global's "SSAT Percentiles", third-party)
export const MIDDLE_MEDIANS: Record<SsatSection, Record<5 | 6 | 7, number>> = {
  Verbal: { 5: 584, 6: 614, 7: 638 },
  Quantitative: { 5: 563, 6: 593, 7: 614 },
  Reading: { 5: 569, 6: 593, 7: 611 },
};
export const MIDDLE_MEDIAN_GRADES = [5, 6, 7] as const;

/** Median rows to show for a level: [grade, per-section medians]. */
export function mediansFor(level: SsatLevel): { grades: number[]; get: (s: SsatSection, g: number) => number } | null {
  if (level === "elementary") return null; // no public percentile data for the Elementary Level
  return level === "middle"
    ? { grades: [...MIDDLE_MEDIAN_GRADES], get: (s, g) => MIDDLE_MEDIANS[s][g as 5 | 6 | 7] }
    : { grades: [...MEDIAN_GRADES], get: (s, g) => MEDIANS[s][g as 8 | 9 | 10] };
}

const COLUMN: Record<SsatSection, 1 | 2 | 3> = { Verbal: 1, Quantitative: 2, Reading: 3 };

export function ssatRawScore(right: number, wrong: number, level: SsatLevel = "upper"): number {
  return level === "elementary" ? right : right - wrong / 4;
}

export function ssatScaledScore(section: SsatSection, raw: number, level: SsatLevel = "upper"): number {
  if (level === "elementary") {
    const chart = ELEMENTARY_CHART[section];
    return chart[Math.max(0, Math.min(chart.length - 1, Math.round(raw)))];
  }
  const TABLE = TABLES[level];
  const col = COLUMN[section];
  // rows that exist for this section, highest raw first
  const rows = TABLE.filter((r) => r[col] !== null).map((r) => [r[0], r[col] as number] as const);
  if (raw >= rows[0][0]) return CEIL[level];
  const last = rows[rows.length - 1];
  if (raw <= last[0]) return Math.max(FLOOR[level], last[1]);
  for (let i = 0; i < rows.length - 1; i++) {
    const [hiRaw, hiScaled] = rows[i];
    const [loRaw, loScaled] = rows[i + 1];
    if (raw <= hiRaw && raw >= loRaw) {
      return Math.round(loScaled + ((raw - loRaw) / (hiRaw - loRaw)) * (hiScaled - loScaled));
    }
  }
  return FLOOR[level];
}

export function ssatSectionOf(categoryname: string | null | undefined): SsatSection | null {
  if (!categoryname) return null;
  if (categoryname.startsWith("Verbal")) return "Verbal";
  if (categoryname.startsWith("Quantitative")) return "Quantitative";
  if (categoryname.startsWith("Reading")) return "Reading";
  return null;
}
