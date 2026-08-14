import { describe, expect, it } from "vitest";
import { decodeImageDataUrl, decodePdfUpload } from "./filePayload";

const pdf = Buffer.from("%PDF-1.7\nminimal test payload").toString("base64");
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]).toString("base64");

describe("upload payload validation", () => {
  it("sanitizes PDF filenames without changing valid bytes", () => {
    const result = decodePdfUpload({
      name: "../../exam?.pdf",
      base64: `data:application/pdf;base64,${pdf}`,
    });
    expect(result.fileName).toBe("exam-.pdf");
    expect(result.bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects mislabeled and malformed uploads", () => {
    expect(() =>
      decodePdfUpload({
        name: "fake.pdf",
        base64: Buffer.from("not pdf").toString("base64"),
      })
    ).toThrow("not a valid PDF");
    expect(() => decodePdfUpload({ name: "fake.pdf", base64: "%%%%" })).toThrow(
      "invalid base64"
    );
    expect(() => decodeImageDataUrl(`data:image/jpeg;base64,${png}`)).toThrow(
      "does not match"
    );
  });
});
