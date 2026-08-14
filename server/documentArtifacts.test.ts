import { describe, expect, it } from "vitest";
import { finalPdfArtifact, replacementPageArtifact, sourceArtifactRows } from "./documentArtifacts";

describe("bundle document persistence rows", () => {
  it("creates question-paper and answer-booklet records bound to the same bundle", () => {
    const rows = sourceArtifactRows("bundle-17", { fileName: "paper.pdf", mimeType: "application/pdf", storageKey: "papers/1", storageUrl: "/manus-storage/papers/1" }, { fileName: "booklet.pdf", mimeType: "application/pdf", storageKey: "booklets/1", storageUrl: "/manus-storage/booklets/1" });
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.bundleId)).toEqual(["bundle-17", "bundle-17"]);
    expect(rows.map(row => row.artifactType)).toEqual(["questionPaper", "answerBooklet"]);
  });

  it("creates retrievable replacement and final-PDF records with their bundle reference", () => {
    const replacement = replacementPageArtifact("bundle-17", 4, "page-4.png", "replacements/4", "/manus-storage/replacements/4");
    const final = finalPdfArtifact("bundle-17", "final.pdf", "final/1", "/manus-storage/final/1");
    expect(replacement).toMatchObject({ bundleId: "bundle-17", artifactType: "replacementPage", pageNumber: 4 });
    expect(final).toMatchObject({ bundleId: "bundle-17", artifactType: "finalPdf", fileName: "final.pdf" });
  });
});
