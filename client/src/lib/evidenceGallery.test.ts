import { describe, expect, it } from "vitest";
import { orderedEvidenceGallery } from "./evidenceGallery";

describe("rendered-page evidence gallery", () => {
  it("keeps every image-backed page in numerical order with its visible clarity label", () => {
    const cards = orderedEvidenceGallery([
      { pageNumber: 8, clarity: "CLEAR", laplacianVariance: 302, reason: "sharp", pageDataUrl: "data:image/jpeg;base64,page8" },
      { pageNumber: 1, clarity: "BLURRY", laplacianVariance: 12, reason: "soft", pageDataUrl: "data:image/jpeg;base64,page1" },
      { pageNumber: 5, clarity: "CLEAR", laplacianVariance: 110, reason: "sharp", pageDataUrl: "data:image/jpeg;base64,page5" },
    ]);
    expect(cards.map(card => [card.pageNumber, card.label, card.previewUrl])).toEqual([[1, "BLURRY", "data:image/jpeg;base64,page1"], [5, "CLEAR", "data:image/jpeg;base64,page5"], [8, "CLEAR", "data:image/jpeg;base64,page8"]]);
  });
});
