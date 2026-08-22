export type AppMode = "real" | "demo" | "test";

export function getAppMode(): AppMode {
  if (process.env.NODE_ENV === "test") return "test";
  return process.env.APP_MODE?.trim().toLowerCase() === "demo" ? "demo" : "real";
}

export function isDemoMode() {
  return getAppMode() === "demo";
}

export function assertProductionRuntime() {
  if (process.env.NODE_ENV !== "production" || getAppMode() !== "real") return;
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const qrSecret = process.env.QR_SIGNING_SECRET?.trim() || jwtSecret;
  const isPlaceholder = (value: string | undefined) =>
    !value || /replace|your_|example|placeholder/i.test(value);
  if (!jwtSecret || isPlaceholder(jwtSecret) || jwtSecret.length < 32)
    throw new Error("Real production mode requires a unique JWT_SECRET of at least 32 characters.");
  if (!qrSecret || isPlaceholder(qrSecret) || qrSecret.length < 32)
    throw new Error("Real production mode requires QR_SIGNING_SECRET (or JWT_SECRET) of at least 32 characters.");
}
