import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeQrWithScanGate, QrDecoderUnavailableError } from "./qrDecoder";

const originalBaseUrl = process.env.SCANGATE_BASE_URL;
const originalToken = process.env.SCANGATE_REVIEWER_TOKEN;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.SCANGATE_BASE_URL = originalBaseUrl;
  process.env.SCANGATE_REVIEWER_TOKEN = originalToken;
});

describe("shared ScanGate QR decoder", () => {
  it("returns the decoded payload from the authenticated ScanGate endpoint", async () => {
    process.env.SCANGATE_BASE_URL = "http://127.0.0.1:8000";
    process.env.SCANGATE_REVIEWER_TOKEN = "reviewer-test-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ payload: "DRISHTI-INTAKE:signed.token", frame_number: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      decodeQrWithScanGate({
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        mimeType: "image/jpeg",
      })
    ).resolves.toEqual({
      payload: "DRISHTI-INTAKE:signed.token",
      frameNumber: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/captures/qr",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns null for an image with no QR and fails closed without config", async () => {
    process.env.SCANGATE_BASE_URL = "http://127.0.0.1:8000";
    process.env.SCANGATE_REVIEWER_TOKEN = "reviewer-test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: "QR not detected" }),
      })
    );
    await expect(
      decodeQrWithScanGate({
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        mimeType: "image/jpeg",
      })
    ).resolves.toBeNull();

    delete process.env.SCANGATE_BASE_URL;
    await expect(
      decodeQrWithScanGate({
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        mimeType: "image/jpeg",
      })
    ).rejects.toBeInstanceOf(QrDecoderUnavailableError);
  });
});
