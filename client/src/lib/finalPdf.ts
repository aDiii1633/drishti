import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";

export async function createFinalPdf(booklet: File, replacementPages: Record<number, string>, verificationToken: string) {
  const document = await PDFDocument.load(await booklet.arrayBuffer());
  const pages = document.getPages();
  for (const [number, dataUrl] of Object.entries(replacementPages)) {
    const page = pages[Number(number) - 1]; if (!page) continue;
    const [metadata, base64] = dataUrl.split(","); const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const image = metadata.includes("png") ? await document.embedPng(bytes) : await document.embedJpg(bytes);
    const { width, height } = page.getSize(); page.drawImage(image, { x: 0, y: 0, width, height });
  }
  const qrData = await QRCode.toDataURL(`${window.location.origin}/api/v1/qr/verify/${verificationToken}`, { margin: 0, width: 110, color: { dark: "#1C1917", light: "#FFFFFF" } });
  const qrBytes = Uint8Array.from(atob(qrData.split(",")[1]), character => character.charCodeAt(0)); const qr = await document.embedPng(qrBytes); const font = await document.embedFont(StandardFonts.Helvetica);
  for (const page of pages) { const { width, height } = page.getSize(); page.drawRectangle({ x: width - 132, y: 12, width: 120, height: 37, color: rgb(1, 1, 1), opacity: .92 }); page.drawImage(qr, { x: width - 126, y: 17, width: 27, height: 27 }); page.drawText("DRISHTI VERIFIED", { x: width - 94, y: 31, size: 5.5, font, color: rgb(.11, .1, .09) }); page.drawText(verificationToken.slice(0, 12).toUpperCase(), { x: width - 94, y: 22, size: 5, font, color: rgb(.48, .37, .06) }); }
  const saved = await document.save();
  const copy = new Uint8Array(saved.byteLength);
  copy.set(saved);
  return new Blob([copy.buffer], { type: "application/pdf" });
}
