import type { Bundle } from "../drizzle/schema";
import { hasCompletedEvaluation, hasStoredScan } from "./bundleWorkflow";

type OperationalBundle = Pick<Bundle, "processingState" | "status">;

export function calculateAdminMetrics(
  bundles: OperationalBundle[],
  evaluatorCount: number,
  schoolCount: number,
) {
  const scanned = bundles.filter(hasStoredScan);
  const evaluated = scanned.filter(hasCompletedEvaluation);

  return {
    schools: schoolCount,
    evaluators: evaluatorCount,
    totalAnswerSheets: bundles.length,
    scanned: scanned.length,
    evaluated: evaluated.length,
    pendingEvaluation: scanned.length - evaluated.length,
  };
}
