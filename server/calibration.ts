export type CalibrationOutcome = { expectedClarity: "CLEAR" | "BLURRY"; observedClarity: "CLEAR" | "BLURRY" };

export function summarizeCalibration(rows: CalibrationOutcome[]) {
  const matches = rows.filter(row => row.expectedClarity === row.observedClarity).length;
  return { total: rows.length, matches, accuracy: rows.length ? Math.round((matches / rows.length) * 100) : null, remainingToFifty: Math.max(0, 50 - rows.length) };
}
