export type RenderedPageEvidence = { pageNumber: number; clarity: "CLEAR" | "BLURRY"; laplacianVariance: number; reason: string; pageDataUrl: string };

export function orderedEvidenceGallery(pages: RenderedPageEvidence[]) {
  return [...pages].filter(page => page.pageDataUrl.startsWith("data:image/")).sort((left, right) => left.pageNumber - right.pageNumber).map(page => ({ pageNumber: page.pageNumber, label: page.clarity, previewUrl: page.pageDataUrl, variance: page.laplacianVariance, reason: page.reason }));
}
