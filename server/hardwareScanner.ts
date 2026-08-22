import { nanoid } from "nanoid";
import { getAppMode } from "./runtimeMode";

export const SCANGATE_QUALITY_STATUSES = [
  "OK",
  "BLUR",
  "CHOP",
  "GLARE",
  "SYSTEM_ERROR",
] as const;

export type ScanGateQualityStatus = (typeof SCANGATE_QUALITY_STATUSES)[number];
export type HardwareScannerState =
  | "OFFLINE"
  | "CONNECTED"
  | "READY"
  | "CAPTURING"
  | "PROCESSING"
  | "ACCEPTED"
  | "RETAKE_REQUIRED"
  | "ERROR";

type ScanGateCaptureRow = {
  scan_id: string;
  device_id: string;
  capture_id: string;
  station_code: string;
  page_number: number | null;
  booklet_ref: string;
  status: ScanGateQualityStatus;
  selected_frame: number;
  created_at: string | number;
};

type ScanGateCaptureDetail = ScanGateCaptureRow & {
  metrics_json?: unknown;
};

export type HardwareCapture = {
  captureId: string;
  deviceId: string;
  stationCode: string;
  pageNumber: number | null;
  bookletRef: string | null;
  status: ScanGateQualityStatus;
  state: HardwareScannerState;
  message: string;
  selectedFrame: number;
  laplacianVariance: number;
  original: Buffer | null;
  enhanced: Buffer | null;
  mimeType: "image/jpeg" | "image/svg+xml";
};

export type HardwareScannerStatus = {
  adapter: "scangate" | "test" | "unavailable";
  state: HardwareScannerState;
  message: string;
  available: boolean;
  testMode: boolean;
};

export type HardwareScannerProvider = {
  adapter: HardwareScannerStatus["adapter"];
  status(): Promise<HardwareScannerStatus>;
  arm(input: {
    captureId: string;
    pageNumber: number;
    bookletRef: string;
  }): Promise<{ cursor: string | null }>;
  captureStatus?(input: {
    captureId: string;
  }): Promise<{ state: HardwareScannerState; message: string } | null>;
  findNextCapture(input: {
    cursor: string | null;
    bookletRef: string;
    captureId?: string;
  }): Promise<HardwareCapture | null>;
};

class HardwareScannerUnavailableError extends Error {
  constructor() {
    super("Hardware scanner unavailable.");
  }
}

const qualityMessages: Record<ScanGateQualityStatus, string> = {
  OK: "Scan accepted",
  BLUR: "Image is blurry. Please keep the paper still and capture again.",
  CHOP: "Full page is not visible. Reposition the paper and try again.",
  GLARE: "Too much light reflection. Adjust the lighting and retry.",
  SYSTEM_ERROR: "Scanner error. Please try again.",
};

export function hardwareQualityMessage(status: ScanGateQualityStatus) {
  return qualityMessages[status];
}

export function hardwareStateForQuality(
  status: ScanGateQualityStatus
): HardwareScannerState {
  return status === "OK"
    ? "ACCEPTED"
    : status === "SYSTEM_ERROR"
      ? "ERROR"
      : "RETAKE_REQUIRED";
}

type ScanGateConfig = {
  baseUrl: string;
  reviewerToken: string;
  stationCode: string;
};

type UsbAgentConfig = {
  baseUrl: string;
};

function scanGateConfig(): ScanGateConfig | null {
  const baseUrl = process.env.SCANGATE_BASE_URL?.trim().replace(/\/$/, "");
  const reviewerToken = process.env.SCANGATE_REVIEWER_TOKEN?.trim();
  const stationCode = process.env.SCANGATE_STATION_CODE?.trim();
  if (!baseUrl || !reviewerToken || !stationCode) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { baseUrl, reviewerToken, stationCode };
}

function usbAgentConfig(): UsbAgentConfig | null {
  const baseUrl =
    process.env.SCANGATE_USB_AGENT_URL?.trim().replace(/\/$/, "") ??
    "http://127.0.0.1:57931";
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
    if (!isLoopback || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
    return { baseUrl };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new HardwareScannerUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseCaptureRow(value: unknown): ScanGateCaptureRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const status = row.status;
  if (
    typeof row.scan_id !== "string" ||
    typeof row.device_id !== "string" ||
    typeof row.capture_id !== "string" ||
    typeof row.station_code !== "string" ||
    typeof row.booklet_ref !== "string" ||
    typeof row.selected_frame !== "number" ||
    !SCANGATE_QUALITY_STATUSES.includes(status as ScanGateQualityStatus)
  ) {
    return null;
  }
  const pageNumber =
    typeof row.page_number === "number" ? row.page_number : null;
  if (pageNumber !== null && !Number.isInteger(pageNumber)) return null;
  return {
    scan_id: row.scan_id,
    device_id: row.device_id,
    capture_id: row.capture_id,
    station_code: row.station_code,
    page_number: pageNumber,
    booklet_ref: row.booklet_ref,
    status: status as ScanGateQualityStatus,
    selected_frame: row.selected_frame,
    created_at:
      typeof row.created_at === "string" || typeof row.created_at === "number"
        ? row.created_at
        : "",
  };
}

function focusMetric(metrics: unknown, selectedFrame: number) {
  let payload = metrics;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return 0;
    }
  }
  const metricRecord = asRecord(payload);
  const frames = metricRecord?.frames;
  if (!Array.isArray(frames)) return 0;
  const frame = frames
    .map(asRecord)
    .find(value => value?.index === selectedFrame);
  const focus = frame?.focus_global;
  return typeof focus === "number" && Number.isFinite(focus)
    ? Math.max(0, Math.round(focus))
    : 0;
}

class ScanGateProvider implements HardwareScannerProvider {
  adapter = "scangate" as const;

  constructor(private readonly config: ScanGateConfig) {}

  private url(path: string) {
    return `${this.config.baseUrl}${path}`;
  }

  private async reviewerJson(path: string) {
    const response = await fetchWithTimeout(this.url(path), {
      headers: { Authorization: `Bearer ${this.config.reviewerToken}` },
    });
    if (!response.ok) throw new HardwareScannerUnavailableError();
    try {
      return await response.json();
    } catch {
      throw new HardwareScannerUnavailableError();
    }
  }

  private async listCaptures(limit = 25) {
    const query = new URLSearchParams({
      station_code: this.config.stationCode,
      limit: String(limit),
    });
    const body = asRecord(
      await this.reviewerJson(`/api/v1/reviewer/captures?${query}`)
    );
    const captures = body?.captures;
    if (!Array.isArray(captures)) throw new HardwareScannerUnavailableError();
    return captures
      .map(parseCaptureRow)
      .filter((capture): capture is ScanGateCaptureRow => Boolean(capture));
  }

  private async image(scanId: string, kind: "original" | "enhanced") {
    const response = await fetchWithTimeout(
      this.url(
        `/api/v1/reviewer/captures/${encodeURIComponent(scanId)}/image/${kind}`
      ),
      { headers: { Authorization: `Bearer ${this.config.reviewerToken}` } }
    );
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.startsWith("image/jpeg")) {
      throw new HardwareScannerUnavailableError();
    }
    const image = Buffer.from(await response.arrayBuffer());
    if (!image.length || image.length > 6 * 1024 * 1024) {
      throw new HardwareScannerUnavailableError();
    }
    return image;
  }

  async status(): Promise<HardwareScannerStatus> {
    const response = await fetchWithTimeout(this.url("/healthz"));
    if (!response.ok) throw new HardwareScannerUnavailableError();
    const station = await fetchWithTimeout(
      this.url("/api/v1/stations/status"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ station_code: this.config.stationCode }),
      }
    );
    if (!station.ok) throw new HardwareScannerUnavailableError();
    const body = asRecord(await station.json().catch(() => null));
    const lastStatus = body?.status;
    if (lastStatus === "OK") {
      return {
        adapter: this.adapter,
        state: "READY",
        message:
          "Scanner service ready. The latest hardware capture was accepted.",
        available: true,
        testMode: false,
      };
    }
    if (
      lastStatus === "BLUR" ||
      lastStatus === "CHOP" ||
      lastStatus === "GLARE"
    ) {
      return {
        adapter: this.adapter,
        state: "READY",
        message:
          "Scanner service ready. The latest hardware capture needs a retake.",
        available: true,
        testMode: false,
      };
    }
    return {
      adapter: this.adapter,
      state: "READY",
      message:
        "Scanner service ready. Press the physical capture button when the page is framed.",
      available: true,
      testMode: false,
    };
  }

  async arm(_input: {
    captureId: string;
    pageNumber: number;
    bookletRef: string;
  }) {
    const captures = await this.listCaptures(1);
    return { cursor: captures[0]?.scan_id ?? null };
  }

  async findNextCapture(input: {
    cursor: string | null;
    bookletRef: string;
    captureId?: string;
  }): Promise<HardwareCapture | null> {
    const captures = await this.listCaptures();
    const next = input.captureId
      ? captures.find(capture => capture.capture_id === input.captureId)
      : captures.find(capture => capture.scan_id !== input.cursor);
    if (!next) return null;
    if (next.booklet_ref && next.booklet_ref !== input.bookletRef) {
      return {
        captureId: next.capture_id,
        deviceId: next.device_id,
        stationCode: next.station_code,
        pageNumber: next.page_number,
        bookletRef: next.booklet_ref,
        status: "SYSTEM_ERROR",
        state: "ERROR",
        message:
          "The scanner capture does not match the verified paper. Re-arm the scanner and capture the correct booklet.",
        selectedFrame: next.selected_frame,
        laplacianVariance: 0,
        original: null,
        enhanced: null,
        mimeType: "image/jpeg",
      };
    }
    if (next.status !== "OK") {
      return {
        captureId: next.capture_id,
        deviceId: next.device_id,
        stationCode: next.station_code,
        pageNumber: next.page_number,
        bookletRef: next.booklet_ref || null,
        status: next.status,
        state: hardwareStateForQuality(next.status),
        message: hardwareQualityMessage(next.status),
        selectedFrame: next.selected_frame,
        laplacianVariance: 0,
        original: null,
        enhanced: null,
        mimeType: "image/jpeg",
      };
    }

    const detail = asRecord(
      await this.reviewerJson(
        `/api/v1/reviewer/captures/${encodeURIComponent(next.scan_id)}`
      )
    ) as ScanGateCaptureDetail | null;
    const [original, enhanced] = await Promise.all([
      this.image(next.scan_id, "original"),
      this.image(next.scan_id, "enhanced"),
    ]);
    return {
      captureId: next.capture_id,
      deviceId: next.device_id,
      stationCode: next.station_code,
      pageNumber: next.page_number,
      bookletRef: next.booklet_ref || null,
      status: "OK",
      state: "ACCEPTED",
      message: hardwareQualityMessage("OK"),
      selectedFrame: next.selected_frame,
      laplacianVariance: focusMetric(detail?.metrics_json, next.selected_frame),
      original,
      enhanced,
      mimeType: "image/jpeg",
    };
  }
}

class UsbScanGateProvider extends ScanGateProvider {
  constructor(
    config: ScanGateConfig,
    private readonly usbAgent: UsbAgentConfig
  ) {
    super(config);
  }

  private async agentJson(path: string, init?: RequestInit) {
    const response = await fetchWithTimeout(`${this.usbAgent.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", ...init?.headers },
    });
    if (!response.ok) throw new HardwareScannerUnavailableError();
    return asRecord(await response.json().catch(() => null));
  }

  async status(): Promise<HardwareScannerStatus> {
    const agent = await this.agentJson("/device/status");
    const agentState = agent?.state;
    if (
      agentState !== "READY" &&
      agentState !== "CAPTURING" &&
      agentState !== "PROCESSING"
    ) {
      throw new HardwareScannerUnavailableError();
    }
    const backend = await super.status();
    return {
      ...backend,
      state:
        agentState === "CAPTURING" || agentState === "PROCESSING"
          ? agentState
          : backend.state,
      message:
        agentState === "CAPTURING"
          ? "USB ScanGate is receiving a two-frame camera capture."
          : agentState === "PROCESSING"
            ? "USB ScanGate is processing the completed camera transfer."
            : "USB ScanGate is ready. Capture will use the local USB serial path.",
    };
  }

  async arm(input: { captureId: string; pageNumber: number; bookletRef: string }) {
    const armed = await super.arm(input);
    const capture = await this.agentJson("/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capture_id: input.captureId,
        page_number: input.pageNumber,
        booklet_ref: input.bookletRef,
      }),
    });
    if (capture?.state !== "CAPTURING" && capture?.state !== "PROCESSING") {
      throw new HardwareScannerUnavailableError();
    }
    return armed;
  }

  async captureStatus(input: { captureId: string }) {
    const capture = await this.agentJson(
      `/capture/${encodeURIComponent(input.captureId)}`
    );
    if (!capture || typeof capture.message !== "string") return null;
    if (capture.state === "CAPTURING") {
      return { state: "CAPTURING" as const, message: capture.message };
    }
    if (capture.state === "PROCESSING") {
      return { state: "PROCESSING" as const, message: capture.message };
    }
    if (capture.state === "COMPLETE") {
      return {
        state: "PROCESSING" as const,
        message: "Two frames processed. Loading the ScanGate quality result.",
      };
    }
    if (capture.state === "ERROR") {
      return { state: "ERROR" as const, message: capture.message };
    }
    return null;
  }
}

function testImage(label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#f7fcff"/><rect x="72" y="72" width="756" height="1056" rx="18" fill="#fff" stroke="#b6d6e8" stroke-width="4"/><text x="120" y="180" fill="#163044" font-family="Arial, sans-serif" font-size="42" font-weight="700">DRISHTI ScanGate test capture</text><text x="120" y="244" fill="#587181" font-family="Arial, sans-serif" font-size="28">${label}</text><line x1="120" y1="330" x2="780" y2="330" stroke="#d9eaf3" stroke-width="4"/><line x1="120" y1="420" x2="730" y2="420" stroke="#c9e2ef" stroke-width="4"/><line x1="120" y1="500" x2="760" y2="500" stroke="#c9e2ef" stroke-width="4"/><line x1="120" y1="580" x2="680" y2="580" stroke="#c9e2ef" stroke-width="4"/></svg>`;
  return Buffer.from(svg, "utf8");
}

class ScanGateTestProvider implements HardwareScannerProvider {
  adapter = "test" as const;
  private captures: Array<HardwareCapture & { scanId: string }> = [];

  async status(): Promise<HardwareScannerStatus> {
    return {
      adapter: this.adapter,
      state: "READY",
      message: "Development test scanner ready.",
      available: true,
      testMode: true,
    };
  }

  async arm(_input: {
    captureId: string;
    pageNumber: number;
    bookletRef: string;
  }) {
    return { cursor: this.captures[0]?.scanId ?? null };
  }

  async findNextCapture(input: {
    cursor: string | null;
    bookletRef: string;
    captureId?: string;
  }): Promise<HardwareCapture | null> {
    const capture = this.captures.find(item => item.scanId !== input.cursor);
    return capture ?? null;
  }

  simulate(status: ScanGateQualityStatus) {
    const captureId = `test-${nanoid(10)}`;
    const accepted = status === "OK";
    const label = accepted
      ? "Enhanced scan preview"
      : `Quality result: ${status}`;
    const capture: HardwareCapture & { scanId: string } = {
      scanId: `test-scan-${nanoid(12)}`,
      captureId,
      deviceId: "SCANGATE-TEST",
      stationCode: "DRISHTI-TEST",
      pageNumber: 1,
      bookletRef: null,
      status,
      state: hardwareStateForQuality(status),
      message: hardwareQualityMessage(status),
      selectedFrame: 0,
      laplacianVariance: accepted ? 240 : 0,
      original: accepted ? testImage("Original test image") : null,
      enhanced: accepted ? testImage(label) : null,
      mimeType: "image/svg+xml",
    };
    this.captures.unshift(capture);
    return capture;
  }
}

class UnavailableHardwareScannerProvider implements HardwareScannerProvider {
  adapter = "unavailable" as const;

  async status(): Promise<HardwareScannerStatus> {
    return {
      adapter: this.adapter,
      state: "OFFLINE",
      message: "Hardware scanner unavailable.",
      available: false,
      testMode: false,
    };
  }

  async arm(_input: {
    captureId: string;
    pageNumber: number;
    bookletRef: string;
  }): Promise<{ cursor: string | null }> {
    throw new HardwareScannerUnavailableError();
  }

  async findNextCapture(_input: {
    cursor: string | null;
    bookletRef: string;
    captureId?: string;
  }): Promise<HardwareCapture | null> {
    throw new HardwareScannerUnavailableError();
  }
}

const testProvider = new ScanGateTestProvider();

export function getHardwareScannerProvider(): HardwareScannerProvider {
  const requestedAdapter = process.env.SCANGATE_ADAPTER?.trim().toLowerCase();
  const developmentTestMode =
    process.env.NODE_ENV !== "production" && getAppMode() !== "real";
  if (
    (requestedAdapter === "mock" && process.env.NODE_ENV !== "production") ||
    developmentTestMode
  ) {
    return testProvider;
  }
  const config = scanGateConfig();
  const usbAgent = usbAgentConfig();
  return config && usbAgent
    ? new UsbScanGateProvider(config, usbAgent)
    : config
      ? new ScanGateProvider(config)
    : new UnavailableHardwareScannerProvider();
}

export function simulateHardwareCapture(status: ScanGateQualityStatus) {
  const provider = getHardwareScannerProvider();
  if (provider !== testProvider) throw new HardwareScannerUnavailableError();
  return testProvider.simulate(status);
}
