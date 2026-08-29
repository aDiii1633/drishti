import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwordAuth";

describe("local password authentication", () => {
  it("verifies a correct password without storing it in the hash", () => {
    const password = "test-password-for-scrypt";
    const storedHash = hashPassword(password);
    expect(storedHash).not.toContain(password);
    expect(verifyPassword(password, storedHash)).toBe(true);
    expect(verifyPassword("wrong-password", storedHash)).toBe(false);
  });

  it("fails closed on a malformed stored hash instead of throwing", () => {
    const valid = hashPassword("test-password-for-scrypt");
    const [, , blockSize, parallelization, salt, key] = valid.split("$");

    // A corrupt cost parameter previously reached scryptSync as NaN and threw,
    // turning a bad credential row into an unhandled error on the login route.
    for (const badHash of [
      "",
      "not-a-hash",
      "bcrypt$16384$8$1$c2FsdA$a2V5",
      `scrypt$not-a-number$${blockSize}$${parallelization}$${salt}$${key}`,
      `scrypt$0$${blockSize}$${parallelization}$${salt}$${key}`,
      // N must be a power of two; scryptSync throws on anything else.
      `scrypt$16383$${blockSize}$${parallelization}$${salt}$${key}`,
      `scrypt$16384$8$1$${salt}$dHJ1bmNhdGVk`,
    ]) {
      expect(() => verifyPassword("test-password-for-scrypt", badHash)).not.toThrow();
      expect(verifyPassword("test-password-for-scrypt", badHash)).toBe(false);
    }

    expect(verifyPassword("test-password-for-scrypt", null)).toBe(false);
    expect(verifyPassword("test-password-for-scrypt", undefined)).toBe(false);
  });
});
