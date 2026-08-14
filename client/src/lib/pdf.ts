import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pageNumbers } from "./pageRange";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ClarityResult = {
  pageNumber: number;
  clarity: "CLEAR" | "BLURRY";
  laplacianVariance: number;
  reason: string;
};
export type PdfPageEvidence = ClarityResult & { pageDataUrl: string };

export { pageNumbers } from "./pageRange";

const storedPdfCache = new Map<
  string,
  ReturnType<typeof pdfjsLib.getDocument>["promise"]
>();

function varianceOfLaplacian(image: ImageData): number {
  const { data, width, height } = image;
  let count = 0;
  let sum = 0;
  let squared = 0;
  const gray = (offset: number) =>
    data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  for (let y = 1; y < height - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      const laplacian =
        4 * gray(center) -
        gray(center - 4) -
        gray(center + 4) -
        gray(center - width * 4) -
        gray(center + width * 4);
      sum += laplacian;
      squared += laplacian * laplacian;
      count += 1;
    }
  return count
    ? Math.max(0, Math.round(squared / count - (sum / count) ** 2))
    : 0;
}

export async function checkPdfClarity(
  file: File,
  onProgress?: (completed: number, total: number) => void,
  onPage?: (page: PdfPageEvidence) => void
): Promise<PdfPageEvidence[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const results: PdfPageEvidence[] = [];
  for (const pageNumber of pageNumbers(pdf.numPages)) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const evidenceScale = Math.min(2.25, 1600 / baseViewport.width);
    const viewport = page.getViewport({ scale: evidenceScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("Canvas analysis is unavailable in this browser.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    // Keep the clarity gate calibrated at its original 1.15x sampling size,
    // while preserving a separate high-resolution evidence image for marking.
    const analysis = document.createElement("canvas");
    analysis.width = Math.max(1, Math.ceil(baseViewport.width * 1.15));
    analysis.height = Math.max(1, Math.ceil(baseViewport.height * 1.15));
    const analysisContext = analysis.getContext("2d", {
      willReadFrequently: true,
    });
    if (!analysisContext)
      throw new Error("Canvas analysis is unavailable in this browser.");
    analysisContext.drawImage(canvas, 0, 0, analysis.width, analysis.height);
    const variance = varianceOfLaplacian(
      analysisContext.getImageData(0, 0, analysis.width, analysis.height)
    );
    const clarity: ClarityResult["clarity"] =
      variance < 150 ? "BLURRY" : "CLEAR";
    const evidence = {
      pageNumber,
      clarity,
      laplacianVariance: variance,
      reason:
        clarity === "CLEAR"
          ? "Variance-of-Laplacian is above the intake threshold."
          : "Low edge variance indicates an insufficiently sharp scan.",
      pageDataUrl: canvas.toDataURL("image/jpeg", 0.86),
    };
    results.push(evidence);
    onPage?.(evidence);
    onProgress?.(pageNumber, pdf.numPages);
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
  return results;
}

export async function renderStoredPdfPage(
  url: string,
  pageNumber: number,
  maxWidth = 1800
): Promise<string> {
  let documentPromise = storedPdfCache.get(url);
  if (!documentPromise) {
    documentPromise = pdfjsLib.getDocument({ url }).promise;
    storedPdfCache.set(url, documentPromise);
    documentPromise.catch(() => storedPdfCache.delete(url));
  }
  const pdf = await documentPromise;
  const safePage = Math.max(1, Math.min(pdf.numPages, pageNumber));
  const page = await pdf.getPage(safePage);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context)
    throw new Error("The document canvas is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function checkImageClarity(
  file: File,
  pageNumber: number
): Promise<ClarityResult> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const target = new Image();
      target.onload = () => resolve(target);
      target.onerror = reject;
      target.src = imageUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("Canvas analysis is unavailable in this browser.");
    context.drawImage(image, 0, 0);
    const variance = varianceOfLaplacian(
      context.getImageData(0, 0, canvas.width, canvas.height)
    );
    const clarity = variance < 150 ? "BLURRY" : "CLEAR";
    return {
      pageNumber,
      clarity,
      laplacianVariance: variance,
      reason:
        clarity === "CLEAR"
          ? "Replacement page passed the variance-of-Laplacian threshold."
          : "Replacement page remains below the required sharpness threshold.",
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function asDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
