import path from "path";
import { describe, expect, it } from "vitest";
import { normalizeKey, sanitizeStorageFileName, STORAGE_ROOT } from "./storage";

describe("local storage path safety", () => {
  it("rejects traversal keys and normalizes safe keys", () => {
    expect(() => normalizeKey("../../outside.pdf")).toThrow(
      "Invalid storage key"
    );
    expect(() => normalizeKey("folder\\..\\..\\outside.pdf")).toThrow(
      "Invalid storage key"
    );
    expect(normalizeKey("drishti\\bundle\\paper.pdf")).toBe(
      "drishti/bundle/paper.pdf"
    );
  });

  it("reduces uploaded names to a safe leaf filename", () => {
    expect(sanitizeStorageFileName("../../question:paper?.pdf")).toBe(
      "question-paper-.pdf"
    );
    expect(path.isAbsolute(STORAGE_ROOT)).toBe(true);
  });
});
