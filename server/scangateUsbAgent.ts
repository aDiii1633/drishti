import { getAppMode } from "./runtimeMode";

export const USB_SCANNER_STATES = [
  "DISCONNECTED",
  "CONNECTING",
  "CONNECTED",
  "READY",
  "CAPTURING",
  "PROCESSING",
  "ERROR",
] as const;

export type UsbScannerState = (typeof USB_SCANNER_STATES)[number];

export type UsbScannerStatus = {
  state: UsbScannerState;
  label: string;
  message: string;
  connected: boolean;
  ready: boolean;
  testMode: boolean;
};

const REQUEST_TIMEOUT_MS = 4_000;
const QR_CAPTURE_TIMEOUT_MS = 35_000;
const PREVIEW_CAPTURE_TIMEOUT_MS = 35_000;
const DEFAULT_AGENT_URL = "http://127.0.0.1:57931";

let developmentState: UsbScannerState = "DISCONNECTED";

function statusFor(
  state: UsbScannerState,
  testMode: boolean
): UsbScannerStatus {
  const copy: Record<UsbScannerState, Pick<UsbScannerStatus, "label" | "message">> = {
    DISCONNECTED: {
      label: "USB Scanner Disconnected",
      message: "Connect the ESP32-S3 using USB.",
    },
    CONNECTING: {
      label: "Connecting to scanner...",
      message: "The USB scanner was detected and is completing its connection check.",
    },
    CONNECTED: {
      label: "USB Scanner Connected",
      message: "The USB scanner is connected. Waiting for the scanner to become ready.",
    },
    READY: {
      label: "Hardware Camera Connected — Ready to Scan",
      message: "The connected USB scanner passed its ScanGate identity check.",
    },
    CAPTURING: {
      label: "Hardware camera busy...",
      message: "The USB camera is collecting a verified two-frame capture.",
    },
    PROCESSING: {
      label: "Processing hardware image...",
      message: "ScanGate is processing the image received from the ESP32 camera.",
    },
    ERROR: {
      label: "Scanner connection error",
      message: "Scanner detected, but it is not responding.",
    },
  };

  return {
    state,
    ...copy[state],
    connected:
      state === "CONNECTED" ||
      state === "READY" ||
      state === "CAPTURING" ||
      state === "PROCESSING",
    ready: state === "READY",
    testMode,
  };
}

function isDevelopmentTestAdapter() {
  return process.env.NODE_ENV !== "production" && getAppMode() !== "real";
}

function agentUrl() {
  const configured =
    process.env.SCANGATE_USB_AGENT_URL?.trim() || DEFAULT_AGENT_URL;
  try {
    const url = new URL(configured);
    const host = url.hostname.toLowerCase();
    const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
    if (!loopback || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
    return url;
  } catch {
    return null;
  }
}

async function agentRequest(path: string, method = "GET") {
  const baseUrl = agentUrl();
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
      method,
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readAgentState(body: unknown): UsbScannerState | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const state = (body as Record<string, unknown>).state;
  return USB_SCANNER_STATES.includes(state as UsbScannerState)
    ? (state as UsbScannerState)
    : null;
}

export async function getUsbScannerStatus(): Promise<UsbScannerStatus> {
  if (isDevelopmentTestAdapter()) return statusFor(developmentState, true);

  const body = await agentRequest("/device/status");
  const state = readAgentState(body);
  return statusFor(state ?? "DISCONNECTED", false);
}

export async function retryUsbScannerConnection(): Promise<UsbScannerStatus> {
  if (isDevelopmentTestAdapter()) return statusFor(developmentState, true);

  await agentRequest("/device/ping", "POST");
  return getUsbScannerStatus();
}

export async function captureUsbQr(): Promise<{
  payload: string;
  frameNumber: number | null;
}> {
  if (isDevelopmentTestAdapter()) {
    throw new Error("A real ESP32 hardware camera is required for Hardware QR mode.");
  }
  const baseUrl = agentUrl();
  if (!baseUrl) throw new Error("The local hardware camera bridge is unavailable.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QR_CAPTURE_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/qr-capture", baseUrl), {
      method: "POST",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = asRecord(await response.json().catch(() => null));
    if (response.status === 422) {
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "QR not detected - move the code inside the frame."
      );
    }
    if (!response.ok) throw new Error("The hardware camera could not capture the QR image.");
    const payload = typeof body?.payload === "string" ? body.payload.trim() : "";
    if (!payload || payload.length > 400) {
      throw new Error("The hardware camera returned an invalid QR payload.");
    }
    return {
      payload,
      frameNumber: typeof body?.frameNumber === "number" ? body.frameNumber : null,
    };
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") throw error;
    throw new Error("The hardware camera timed out while scanning the QR.");
  } finally {
    clearTimeout(timeout);
  }
}

type UsbPreview = {
  image: string;
  capturedAt: string;
  source: string;
};

let previewCaptureInFlight: Promise<UsbPreview> | null = null;

async function requestUsbPreview(): Promise<UsbPreview> {
  if (isDevelopmentTestAdapter()) {
    throw new Error("A real ESP32 hardware camera is required for Hardware preview mode.");
  }
  const baseUrl = agentUrl();
  if (!baseUrl) throw new Error("The local hardware camera bridge is unavailable.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_CAPTURE_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/preview", baseUrl), {
      method: "POST",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      throw new Error("The hardware camera could not provide a preview frame.");
    }
    const imageBase64 =
      typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64 || imageBase64.length > 8_000_000) {
      throw new Error("The hardware camera returned an invalid preview frame.");
    }
    const image = Buffer.from(imageBase64, "base64");
    if (
      image.length < 4 ||
      image.length > 6 * 1024 * 1024 ||
      image[0] !== 0xff ||
      image[1] !== 0xd8 ||
      image.at(-2) !== 0xff ||
      image.at(-1) !== 0xd9
    ) {
      throw new Error("The hardware camera returned an invalid preview frame.");
    }
    return {
      image: `data:image/jpeg;base64,${image.toString("base64")}`,
      capturedAt:
        typeof body?.capturedAt === "string"
          ? body.capturedAt
          : new Date().toISOString(),
      source:
        typeof body?.source === "string"
          ? body.source.slice(0, 160)
          : "ESP32 USB camera",
    };
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") throw error;
    throw new Error("The hardware camera timed out while capturing a preview frame.");
  } finally {
    clearTimeout(timeout);
  }
}

export function captureUsbPreview(): Promise<UsbPreview> {
  if (previewCaptureInFlight) return previewCaptureInFlight;
  const operation = requestUsbPreview();
  previewCaptureInFlight = operation;
  void operation.finally(() => {
    if (previewCaptureInFlight === operation) previewCaptureInFlight = null;
  }).catch(() => undefined);
  return operation;
}

export function setDevelopmentUsbScannerState(state: UsbScannerState) {
  if (!isDevelopmentTestAdapter()) {
    throw new Error("Development USB scanner controls are unavailable.");
  }
  developmentState = state;
  return statusFor(developmentState, true);
}
