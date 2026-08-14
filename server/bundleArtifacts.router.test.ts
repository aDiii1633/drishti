import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditEvents,
  bundles,
  documents,
  evaluations,
  markingSchemes,
  pageChecks,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { storageDelete, storagePut } from "./storage";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./storage", async importOriginal => ({
  ...(await importOriginal<typeof import("./storage")>()),
  storagePut: vi.fn(),
  storageDelete: vi.fn(),
}));

const mockedGetDb = vi.mocked(getDb);
const mockedStoragePut = vi.mocked(storagePut);
const mockedStorageDelete = vi.mocked(storageDelete);
const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.7\nfixture").toString("base64")}`;
const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]).toString("base64")}`;

function operatorContext(): TrpcContext {
  return {
    user: null,
    roleSession: {
      role: "operator",
      displayName: "Operator desk",
      issuedAt: 1,
      expiresAt: 43_201,
    },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("router-backed bundle document lifecycle", () => {
  const storedDocuments: any[] = [];
  const storedBundles: any[] = [];

  beforeEach(() => {
    storedDocuments.length = 0;
    storedBundles.length = 0;
    let key = 0;
    mockedStorageDelete.mockResolvedValue(undefined);
    mockedStoragePut.mockImplementation(async () => ({
      key: `stored/${++key}`,
      url: `/manus-storage/stored/${key}`,
    }));
    const chain = (rows: any[]) =>
      Object.assign(Promise.resolve(rows), {
        where: () => chain(rows),
        limit: (count: number) => Promise.resolve(rows.slice(0, count)),
        orderBy: () => Promise.resolve(rows),
      });
    const fakeDb = {
      insert: (table: unknown) => ({
        values: async (rows: any) => {
          const values = Array.isArray(rows) ? rows : [rows];
          if (table === documents) storedDocuments.push(...values);
          if (table === bundles) storedBundles.push(...values);
        },
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      select: () => ({
        from: (table: unknown) => {
          if (table === bundles) return chain(storedBundles);
          if (table === documents) return chain(storedDocuments);
          if (
            table === pageChecks ||
            table === evaluations ||
            table === markingSchemes ||
            table === auditEvents
          )
            return chain([]);
          return chain([]);
        },
      }),
    };
    mockedGetDb.mockResolvedValue(fakeDb as any);
  });

  it("persists and retrieves source, replacement, and final artifacts through the actual bundle procedures", async () => {
    const caller = appRouter.createCaller(operatorContext());
    const created = await caller.bundles.create({
      candidateName: "Candidate 1",
      subject: "Subject",
      catalogTotal: 80,
      questionPaper: { name: "paper.pdf", base64: pdf },
      booklet: { name: "booklet.pdf", base64: pdf },
      pages: [
        {
          pageNumber: 1,
          clarity: "CLEAR",
          laplacianVariance: 200,
          reason: "clear",
        },
      ],
    });
    await caller.bundles.replacePage({
      bundleId: created.id,
      page: {
        pageNumber: 1,
        clarity: "CLEAR",
        laplacianVariance: 220,
        reason: "replacement clear",
        pageDataUrl: png,
      },
    });
    await caller.bundles.finalize({
      bundleId: created.id,
      qrToken: "verification-token-12345",
      finalPdf: { name: "final.pdf", base64: pdf },
    });
    const result = await caller.bundles.get({ id: created.id });
    expect(
      result.documents
        .filter(document => document.bundleId === created.id)
        .map(document => document.artifactType)
        .sort()
    ).toEqual([
      "answerBooklet",
      "finalPdf",
      "questionPaper",
      "replacementPage",
    ]);
    expect(result.documentIntegrity).toEqual({
      hasQuestionPaper: true,
      hasAnswerBooklet: true,
      hasFinalPdf: true,
    });
  });
});
