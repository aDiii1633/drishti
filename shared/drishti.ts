// `operator` is the existing backend role for the Scanner / scan-operator desk.
// Keeping the persisted value preserves compatibility with the intake workflow.
export const DRISHTI_ROLES = ["operator", "evaluator", "student", "school_admin", "admin"] as const;
export type DrishtiRole = (typeof DRISHTI_ROLES)[number];

export const BUNDLE_STATUSES = ["intake", "review", "grading", "moderation", "finalized"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

export type SchemeQuestion = {
  id: string;
  /** Stable printed number stored with the published question set. */
  questionNumber?: string | number;
  label: string;
  /** Full official wording when a compact label is also used in navigation. */
  questionText?: string;
  maximumMarks: number;
  keyPoints: string[];
  /** Presentation metadata is stored with the immutable question set used by a paper QR. */
  order?: number;
  questionType?: "short_answer" | "long_answer" | "objective" | "practical" | "other";
  section?: string;
  keywords?: string[];
  requiredConcepts?: string[];
  rubric?: Array<{
    id: string;
    label: string;
    maximumMarks: number;
  }>;
};

export type PageClarity = "CLEAR" | "BLURRY";

export type ScoreDenominator = {
  total: number;
  source: "paper" | "operator" | "catalog";
  coverageComplete: boolean;
  note: string;
};
