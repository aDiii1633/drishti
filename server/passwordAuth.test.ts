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
});
