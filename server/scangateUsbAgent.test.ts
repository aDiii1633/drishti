import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureUsbPreview,
  captureUsbQr,
  getUsbScannerStatus,
  retryUsbScannerConnection,
  setDevelopmentUsbScannerState,
} from "./scangateUsbAgent";

const originalAppMode = process.env.APP_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalAgentUrl = process.env.SCANGATE_USB_AGENT_URL;
const originalRealHardwareSetting = process.env.SCANGATE_USE_REAL_HARDWARE;

beforeEach(() => {
  process.env.SCANGATE_USE_REAL_HARDWARE = "false";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.APP_MODE = originalAppMode;
  process.env.NODE_ENV = originalNodeEnv;
  process.env.SCANGATE_USB_AGENT_URL = originalAgentUrl;
  process.env.SCANGATE_USE_REAL_HARDWARE = originalRealHardwareSetting;
});

describe("ScanGate USB agent gateway", () => {
  it("keeps the development adapter explicitly disconnected until selected", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "demo";
    setDevelopmentUsbScannerState("DISCONNECTED");

    await expect(getUsbScannerStatus()).resolves.toMatchObject({
      state: "DISCONNECTED",
      connected: false,
      ready: false,
      testMode: true,
    });
  });

  it("exposes development connection states without impersonating production", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "demo";

    expect(setDevelopmentUsbScannerState("READY")).toMatchObject({
      state: "READY",
      connected: true,
      ready: true,
      testMode: true,
    });
  });

  it("reads a real loopback agent status and never returns raw device details", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "demo";
    process.env.SCANGATE_USE_REAL_HARDWARE = "true";
    process.env.SCANGATE_USB_AGENT_URL = "http://127.0.0.1:57931";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          state: "READY",
          device: { deviceId: "private-device-id" },
        }),
      })
    );

    await expect(getUsbScannerStatus()).resolves.toEqual({
      state: "READY",
      label: "Hardware Camera Connected — Ready to Scan",
      message: "The connected USB scanner passed its ScanGate identity check.",
      connected: true,
      ready: true,
      testMode: false,
    });
  });

  it("keeps a busy real camera connected without calling preview work an answer-sheet capture", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "real";
    process.env.SCANGATE_USB_AGENT_URL = "http://127.0.0.1:57931";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: "CAPTURING" }),
      })
    );

    await expect(getUsbScannerStatus()).resolves.toEqual({
      state: "CAPTURING",
      label: "Hardware camera busy...",
      message: "The USB camera is collecting a verified two-frame capture.",
      connected: true,
      ready: false,
      testMode: false,
    });
  });

  it("fails closed when the agent is unavailable or not local", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "real";
    process.env.SCANGATE_USB_AGENT_URL = "http://usb-agent.example.test:57931";

    await expect(retryUsbScannerConnection()).resolves.toMatchObject({
      state: "DISCONNECTED",
      connected: false,
      testMode: false,
    });
  });

  it("uses the real loopback bridge for hardware QR capture", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "real";
    process.env.SCANGATE_USB_AGENT_URL = "http://127.0.0.1:57931";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        payload: "DRISHTI-INTAKE:hardware.signed-token",
        frameNumber: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(captureUsbQr()).resolves.toEqual({
      payload: "DRISHTI-INTAKE:hardware.signed-token",
      frameNumber: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:57931/qr-capture"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns only a validated JPEG data URL for a real hardware preview", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "real";
    process.env.SCANGATE_USB_AGENT_URL = "http://127.0.0.1:57931";
    const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        imageBase64: jpeg.toString("base64"),
        capturedAt: "2026-08-22T10:00:00.000Z",
        source: "ESP32-S3-N1-S R8 USB camera",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(captureUsbPreview()).resolves.toEqual({
      image: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      capturedAt: "2026-08-22T10:00:00.000Z",
      source: "ESP32-S3-N1-S R8 USB camera",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:57931/preview"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shares one hardware preview request across concurrent callers", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "real";
    process.env.SCANGATE_USB_AGENT_URL = "http://127.0.0.1:57931";
    const jpeg = Buffer.from([0xff, 0xd8, 0x03, 0x04, 0xff, 0xd9]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        imageBase64: jpeg.toString("base64"),
        capturedAt: "2026-08-22T10:01:00.000Z",
        source: "ESP32-S3-N1-S R8 USB camera",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      captureUsbPreview(),
      captureUsbPreview(),
    ]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
