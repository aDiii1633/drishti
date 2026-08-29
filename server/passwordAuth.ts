import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export const LOCAL_PASSWORD_MIN_LENGTH = 8;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export function verifyPassword(
  password: string,
  storedHash: string | null | undefined
) {
  if (!storedHash) return false;
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] =
    storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  if (!salt.length || expectedKey.length !== KEY_LENGTH) return false;
  // A corrupt or hand-edited row must fail closed. Without these checks a
  // non-numeric cost reached scryptSync as NaN, which throws and surfaced as an
  // unhandled 500 on the login route instead of a clean credential rejection.
  const n = Number(cost);
  const r = Number(blockSize);
  const p = Number(parallelization);
  const isPositiveInteger = (value: number) =>
    Number.isInteger(value) && value > 0;
  if (!isPositiveInteger(n) || !isPositiveInteger(r) || !isPositiveInteger(p))
    return false;
  // scryptSync also throws when N is not a power of two or memory would exceed
  // the default limit, so keep the whole derivation inside the guard.
  try {
    const actualKey = scryptSync(password, salt, expectedKey.length, {
      N: n,
      r,
      p,
    });
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
