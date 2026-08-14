import { describe, expect, it } from "vitest";
import { pageNumbers } from "./pageRange";

describe("PDF page coverage", () => {
  it("includes every page number through the final PDF page", () => {
    expect(pageNumbers(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("returns no pages for an empty document count", () => {
    expect(pageNumbers(0)).toEqual([]);
  });
});
