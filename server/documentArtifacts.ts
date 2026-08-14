import { nanoid } from "nanoid";
import type { ArtifactType } from "./documentIntegrity";

export type DocumentArtifactRow = {
  id: string;
  bundleId: string;
  artifactType: ArtifactType;
  fileName: string;
  mimeType: string;
  storageKey: string;
  storageUrl: string;
  pageNumber: number | null;
};

function artifact(
  bundleId: string,
  artifactType: ArtifactType,
  fileName: string,
  mimeType: string,
  storageKey: string,
  storageUrl: string,
  pageNumber: number | null = null
): DocumentArtifactRow {
  return {
    id: nanoid(16),
    bundleId,
    artifactType,
    fileName,
    mimeType,
    storageKey,
    storageUrl,
    pageNumber,
  };
}

export const sourceArtifactRows = (
  bundleId: string,
  paper: Omit<
    DocumentArtifactRow,
    "id" | "bundleId" | "artifactType" | "pageNumber"
  >,
  booklet: Omit<
    DocumentArtifactRow,
    "id" | "bundleId" | "artifactType" | "pageNumber"
  >
) => [
  artifact(
    bundleId,
    "questionPaper",
    paper.fileName,
    paper.mimeType,
    paper.storageKey,
    paper.storageUrl
  ),
  artifact(
    bundleId,
    "answerBooklet",
    booklet.fileName,
    booklet.mimeType,
    booklet.storageKey,
    booklet.storageUrl
  ),
];

export const finalPdfArtifact = (
  bundleId: string,
  fileName: string,
  storageKey: string,
  storageUrl: string
) =>
  artifact(
    bundleId,
    "finalPdf",
    fileName,
    "application/pdf",
    storageKey,
    storageUrl
  );
export const replacementPageArtifact = (
  bundleId: string,
  pageNumber: number,
  fileName: string,
  storageKey: string,
  storageUrl: string,
  mimeType = "image/png"
) =>
  artifact(
    bundleId,
    "replacementPage",
    fileName,
    mimeType,
    storageKey,
    storageUrl,
    pageNumber
  );
