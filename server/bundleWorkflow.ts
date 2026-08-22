import type { Bundle } from "../drizzle/schema";

export const BUNDLE_PROCESSING_STATES = [
  "captured",
  "saved",
  "ready_for_evaluation",
  "assigned",
  "grading",
  "submitted",
  "recheck_required",
  "completed",
] as const;

export type BundleProcessingState = (typeof BUNDLE_PROCESSING_STATES)[number];

type OperationalBundle = Pick<Bundle, "processingState" | "status">;

/** A scan exists only after a source image has been stored. */
export function hasStoredScan(bundle: OperationalBundle) {
  return bundle.processingState !== "captured";
}

/** A result is operationally complete once human evaluation is submitted or finalized. */
export function hasCompletedEvaluation(bundle: OperationalBundle) {
  return (
    bundle.status === "finalized" ||
    ["submitted", "recheck_required", "completed"].includes(
      bundle.processingState,
    )
  );
}

/** Only a submitted, QR-linked scan may enter an evaluator queue. */
export function canAssignEvaluator(bundle: OperationalBundle) {
  return bundle.processingState === "ready_for_evaluation" ||
    bundle.processingState === "assigned";
}
