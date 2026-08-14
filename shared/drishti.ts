export const DRISHTI_ROLES = ["operator", "evaluator", "moderator", "admin"] as const;
export type DrishtiRole = (typeof DRISHTI_ROLES)[number];

export const BUNDLE_STATUSES = ["intake", "review", "grading", "moderation", "finalized"] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

export type SchemeQuestion = {
  id: string;
  label: string;
  maximumMarks: number;
  keyPoints: string[];
};

export type PageClarity = "CLEAR" | "BLURRY";

export type ScoreDenominator = {
  total: number;
  source: "paper" | "operator" | "catalog";
  coverageComplete: boolean;
  note: string;
};
