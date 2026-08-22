import { describe, expect, it } from "vitest";
import {
  getHardwareScannerProvider,
  hardwareQualityMessage,
  hardwareStateForQuality,
  simulateHardwareCapture,
} from "./hardwareScanner";

describe("ScanGate hardware scanner adapter", () => {
  it("uses the development-only provider in the test runtime", async () => {
    const provider = getHardwareScannerProvider();
    const status = await provider.status();

    expect(status).toMatchObject({
      adapter: "test",
      state: "READY",
      available: true,
      testMode: true,
    });
  });

  it("keeps an armed capture empty until ScanGate produces a new result", async () => {
    const provider = getHardwareScannerProvider();
    const armed = await provider.arm({
      captureId: "test-arm-empty",
      pageNumber: 1,
      bookletRef: "paper-1",
    });

    await expect(
      provider.findNextCapture({ cursor: armed.cursor, bookletRef: "paper-1" })
    ).resolves.toBeNull();
  });

  it("returns accepted original and enhanced test images only for OK", async () => {
    const provider = getHardwareScannerProvider();
    const armed = await provider.arm({
      captureId: "test-arm-ok",
      pageNumber: 1,
      bookletRef: "paper-1",
    });
    simulateHardwareCapture("OK");

    const capture = await provider.findNextCapture({
      cursor: armed.cursor,
      bookletRef: "paper-1",
    });

    expect(capture).toMatchObject({ status: "OK", state: "ACCEPTED" });
    expect(capture?.original?.length).toBeGreaterThan(0);
    expect(capture?.enhanced?.length).toBeGreaterThan(0);
  });

  it("maps rejected ScanGate decisions to operator-safe retake messages", () => {
    expect(hardwareStateForQuality("BLUR")).toBe("RETAKE_REQUIRED");
    expect(hardwareStateForQuality("CHOP")).toBe("RETAKE_REQUIRED");
    expect(hardwareStateForQuality("GLARE")).toBe("RETAKE_REQUIRED");
    expect(hardwareStateForQuality("SYSTEM_ERROR")).toBe("ERROR");
    expect(hardwareQualityMessage("GLARE")).toContain("light reflection");
  });
});
