import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { SerialPort } from "serialport";

const MAGIC = Buffer.from("SG01", "ascii");
const PROTOCOL_VERSION = 1;
const HEADER_BYTES = 16;
const MAX_PACKET_BYTES = 6 * 1024 * 1024 + 64;
const MAX_CAPTURE_ID_BYTES = 64;
const AGENT_PORT = readInteger("SCANGATE_USB_AGENT_PORT", 57931, 1, 65_535);
const BAUD_RATE = readInteger("SCANGATE_USB_BAUD_RATE", 921_600, 9_600, 921_600);
const POLL_INTERVAL_MS = readInteger("SCANGATE_USB_POLL_INTERVAL_MS", 1_500, 500, 10_000);
const CONTROL_TIMEOUT_MS = readInteger("SCANGATE_USB_REQUEST_TIMEOUT_MS", 3_000, 300, 10_000);
const FRAME_TIMEOUT_MS = readInteger("SCANGATE_USB_FRAME_TIMEOUT_MS", 12_000, 1_000, 60_000);
const RETRY_BACKOFF_MS = readInteger("SCANGATE_USB_RETRY_BACKOFF_MS", 5_000, 1_000, 30_000);
const EXPECTED_DEVICE_ID = process.env.SCANGATE_USB_EXPECTED_DEVICE_ID?.trim() ?? "";
const EXPECTED_VID_PID = parseVidPid(process.env.SCANGATE_USB_EXPECTED_VID_PID);
const REQUESTED_PORT = process.env.SCANGATE_USB_PORT?.trim().toUpperCase() ?? "";
const INGEST_URL = requiredLoopbackUrl(process.env.SCANGATE_USB_INGEST_URL ?? "http://127.0.0.1:8000/api/v1/captures/usb");
const QR_DECODE_URL = appendUrlPath(INGEST_URL, "/qr");
const configuredIngestToken = process.env.SCANGATE_USB_INGEST_TOKEN?.trim();
const INGEST_TOKEN = configuredIngestToken ?? "dev-insecure-usb-agent-token-change-me";
if (
  process.env.APP_MODE?.trim().toLowerCase() !== "demo" &&
  (!configuredIngestToken || configuredIngestToken === "dev-insecure-usb-agent-token-change-me")
) {
  throw new Error(
    "SCANGATE_USB_INGEST_TOKEN must be configured with a non-default local secret outside demo mode."
  );
}

const PacketType = {
  PING: 1, PONG: 2, STATUS: 3, GET_DEVICE_INFO: 4, DEVICE_INFO: 5,
  CAPTURE: 10, ACK: 11, NACK: 12, CAPTURE_STARTED: 13, FRAME_START: 14,
  FRAME_DATA: 15, FRAME_END: 16, FRAME_VALID: 17, CAPTURE_COMPLETE: 18,
  STOP: 19, RESET: 20, ERROR: 255,
} as const;

type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];
type AgentState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "READY" | "CAPTURING" | "PROCESSING" | "ERROR";
type CaptureState = "CAPTURING" | "PROCESSING" | "COMPLETE" | "ERROR";
type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];
type Packet = { type: PacketTypeValue; captureId: string; frameNumber: number; payload: Buffer };
type DeviceInfo = {
  device: "ScanGate";
  hardware: "ESP32-S3-N1-S R8";
  deviceId: string;
  firmwareVersion: string;
  camera: "available" | "unavailable";
  status: string;
};
type CaptureJob = {
  captureId: string;
  pageNumber: number | null;
  bookletRef: string;
  state: CaptureState;
  message: string;
  createdAt: string;
  completedAt?: string;
  result?: unknown;
};

class QrNotDetectedError extends Error {}

function readInteger(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function parseVidPid(value: string | undefined) {
  const match = value?.trim().match(/^([0-9a-f]{4}):([0-9a-f]{4})$/i);
  return match ? { vendorId: match[1].toUpperCase(), productId: match[2].toUpperCase() } : null;
}

function requiredLoopbackUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!isLoopback(host) || (url.protocol !== "http:" && url.protocol !== "https:")) throw new Error("SCANGATE_USB_INGEST_URL must be a loopback http(s) URL");
  return url.toString();
}

function appendUrlPath(value: string, suffix: string) {
  const url = new URL(value);
  url.pathname = `${url.pathname.replace(/\/$/, "")}${suffix}`;
  return url.toString();
}

function isLoopback(address: string | undefined) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address === "localhost";
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jsonPayload(value: unknown) { return Buffer.from(JSON.stringify(value), "utf8"); }

function parseJsonPayload(packet: Packet): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(packet.payload.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function makePacket(type: PacketTypeValue, captureId = "", frameNumber = 255, payload = Buffer.alloc(0)) {
  const captureIdBytes = Buffer.from(captureId, "utf8");
  if (captureIdBytes.length > MAX_CAPTURE_ID_BYTES || payload.length > MAX_PACKET_BYTES) throw new Error("Invalid ScanGate packet size");
  const buffer = Buffer.allocUnsafe(HEADER_BYTES + captureIdBytes.length + payload.length);
  MAGIC.copy(buffer, 0);
  buffer[4] = PROTOCOL_VERSION;
  buffer[5] = type;
  buffer[6] = frameNumber;
  buffer[7] = captureIdBytes.length;
  buffer.writeUInt32LE(payload.length, 8);
  buffer.writeUInt32LE(crc32(payload), 12);
  captureIdBytes.copy(buffer, HEADER_BYTES);
  payload.copy(buffer, HEADER_BYTES + captureIdBytes.length);
  return buffer;
}

function isValidCaptureId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function isCandidate(port: PortInfo) {
  if (REQUESTED_PORT && port.path.toUpperCase() !== REQUESTED_PORT) return false;
  if (EXPECTED_VID_PID) return port.vendorId?.toUpperCase() === EXPECTED_VID_PID.vendorId && port.productId?.toUpperCase() === EXPECTED_VID_PID.productId;
  const descriptor = [port.manufacturer, port.pnpId, port.friendlyName].filter(Boolean).join(" ");
  return Boolean(port.vendorId || /usb|esp32|cp210|ch34|wch|silicon labs/i.test(descriptor));
}

function identityMatches(identity: DeviceInfo, port: PortInfo) {
  if (identity.device !== "ScanGate" || identity.hardware !== "ESP32-S3-N1-S R8" || identity.camera !== "available") return false;
  if (EXPECTED_DEVICE_ID && identity.deviceId !== EXPECTED_DEVICE_ID) return false;
  if (EXPECTED_VID_PID && (port.vendorId?.toUpperCase() !== EXPECTED_VID_PID.vendorId || port.productId?.toUpperCase() !== EXPECTED_VID_PID.productId)) return false;
  return true;
}

function stateForDevice(info: DeviceInfo): AgentState {
  if (info.camera !== "available") return "ERROR";
  if (info.status === "READY" || info.status === "OK" || info.status === "RETAKE") return "READY";
  if (info.status === "CAPTURING" || info.status === "TRANSFERRING") return "CAPTURING";
  if (info.status === "BOOT" || info.status === "CONNECTING") return "CONNECTED";
  return "ERROR";
}

class SerialLink {
  private receiveBuffer = Buffer.alloc(0);
  private readonly backlog: Packet[] = [];
  private readonly waiters = new Set<{
    predicate: (packet: Packet) => boolean;
    resolve: (packet: Packet) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(
    readonly port: SerialPort,
    private readonly onClosed: () => void,
    private readonly onPacket: (packet: Packet) => void
  ) {
    port.on("data", data => this.onData(Buffer.from(data)));
    port.on("error", () => this.failAll(new Error("Serial link error")));
    port.on("close", () => { this.failAll(new Error("Serial link closed")); this.onClosed(); });
  }

  async open() {
    await new Promise<void>((resolve, reject) => this.port.open(error => error ? reject(error) : resolve()));
  }

  async close() {
    this.failAll(new Error("Serial link closed"));
    if (!this.port.isOpen) return;
    await new Promise<void>(resolve => this.port.close(() => resolve()));
  }

  async send(type: PacketTypeValue, captureId = "", frameNumber = 255, payload = Buffer.alloc(0)) {
    if (!this.port.isOpen) throw new Error("Serial link is closed");
    const wire = makePacket(type, captureId, frameNumber, payload);
    await new Promise<void>((resolve, reject) => this.port.write(wire, error => error ? reject(error) : resolve()));
    await new Promise<void>((resolve, reject) => this.port.drain(error => error ? reject(error) : resolve()));
  }

  waitFor(predicate: (packet: Packet) => boolean, timeoutMs: number) {
    const queuedIndex = this.backlog.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.backlog.splice(queuedIndex, 1)[0]);
    return new Promise<Packet>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: (packet: Packet) => { clearTimeout(waiter.timeout); this.waiters.delete(waiter); resolve(packet); },
        reject: (error: Error) => { clearTimeout(waiter.timeout); this.waiters.delete(waiter); reject(error); },
        timeout: setTimeout(() => waiter.reject(new Error("Serial protocol timed out")), timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  async request(type: PacketTypeValue, expected: PacketTypeValue, captureId = "", frameNumber = 255, payload = Buffer.alloc(0), timeoutMs = CONTROL_TIMEOUT_MS) {
    const response = this.waitFor(packet => packet.type === expected && packet.captureId === captureId && packet.frameNumber === frameNumber, timeoutMs);
    await this.send(type, captureId, frameNumber, payload);
    return response;
  }

  private onData(data: Buffer) {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
    while (this.receiveBuffer.length >= HEADER_BYTES) {
      const start = this.receiveBuffer.indexOf(MAGIC);
      if (start < 0) { this.receiveBuffer = this.receiveBuffer.subarray(Math.max(0, this.receiveBuffer.length - 3)); return; }
      if (start > 0) this.receiveBuffer = this.receiveBuffer.subarray(start);
      if (this.receiveBuffer.length < HEADER_BYTES) return;
      const version = this.receiveBuffer[4];
      const type = this.receiveBuffer[5] as PacketTypeValue;
      const frameNumber = this.receiveBuffer[6];
      const captureIdLength = this.receiveBuffer[7];
      const payloadLength = this.receiveBuffer.readUInt32LE(8);
      if (version !== PROTOCOL_VERSION || captureIdLength > MAX_CAPTURE_ID_BYTES || payloadLength > MAX_PACKET_BYTES) { this.receiveBuffer = this.receiveBuffer.subarray(1); continue; }
      const total = HEADER_BYTES + captureIdLength + payloadLength;
      if (this.receiveBuffer.length < total) return;
      const payloadStart = HEADER_BYTES + captureIdLength;
      const payload = this.receiveBuffer.subarray(payloadStart, total);
      if (crc32(payload) !== this.receiveBuffer.readUInt32LE(12)) { this.receiveBuffer = this.receiveBuffer.subarray(1); continue; }
      const packet: Packet = { type, frameNumber, captureId: this.receiveBuffer.subarray(HEADER_BYTES, payloadStart).toString("utf8"), payload: Buffer.from(payload) };
      this.receiveBuffer = this.receiveBuffer.subarray(total);
      let delivered = false;
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(packet)) {
          waiter.resolve(packet);
          delivered = true;
          break;
        }
      }
      if (!delivered) {
        if (this.backlog.length >= 32) this.backlog.shift();
        this.backlog.push(packet);
        this.onPacket(packet);
      }
    }
  }

  private failAll(error: Error) { for (const waiter of [...this.waiters]) waiter.reject(error); }
}

class ScanGateUsbAgent {
  private state: AgentState = "DISCONNECTED";
  private link: SerialLink | undefined;
  private portPath: string | undefined;
  private identity: DeviceInfo | undefined;
  private reconciling = false;
  private nextAttemptAt = 0;
  private readonly jobs = new Map<string, CaptureJob>();
  private previewCapture: Promise<{
    captureId: string;
    mimeType: string;
    imageBase64: string;
    capturedAt: string;
    source: string;
  }> | undefined;

  async start() {
    await this.reconcile();
    setInterval(() => void this.reconcile(), POLL_INTERVAL_MS).unref();
  }

  status() {
    return {
      state: this.state,
      connected: Boolean(this.link),
      ready: this.state === "READY",
      device: this.identity ? { hardware: this.identity.hardware, firmwareVersion: this.identity.firmwareVersion, camera: this.identity.camera } : undefined,
    };
  }

  deviceInfo() { return this.identity ? { ...this.identity, port: this.portPath } : null; }

  async ping() {
    await this.reconcile(true);
    if (!this.link) return this.status();
    const pong = await this.link.request(PacketType.PING, PacketType.PONG);
    const identity = this.parseIdentity(pong);
    if (!identity) throw new Error("Invalid PONG identity");
    this.identity = identity;
    this.setState(stateForDevice(identity));
    return this.status();
  }

  startCapture(input: { captureId: string; pageNumber: number | null; bookletRef: string }) {
    if (!isValidCaptureId(input.captureId)) throw new Error("Invalid capture id");
    const existing = this.jobs.get(input.captureId);
    if (existing) return existing;
    if (!this.link || this.state !== "READY" || !this.identity) throw new Error("Scanner is not ready");
    const job: CaptureJob = { captureId: input.captureId, pageNumber: input.pageNumber, bookletRef: input.bookletRef.slice(0, 128), state: "CAPTURING", message: "Camera capture started.", createdAt: new Date().toISOString() };
    this.jobs.set(job.captureId, job);
    this.setState("CAPTURING");
    void this.captureAndIngest(job);
    return job;
  }

  capture(captureId: string) { return this.jobs.get(captureId) ?? null; }

  async reset() {
    if (!this.link) throw new Error("Scanner is not connected");
    await this.link.request(PacketType.RESET, PacketType.ACK);
    await this.dropLink();
    return this.status();
  }

  async stop() { await this.dropLink(); }

  async captureQr() {
    const link = this.link;
    const identity = this.identity;
    if (!link || !identity || this.state !== "READY") throw new Error("Hardware camera is not ready");
    const captureId = `qr-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    let frames: Buffer[] = [];
    this.setState("CAPTURING");
    try {
      await link.request(PacketType.CAPTURE, PacketType.ACK, captureId, 255, jsonPayload({ mode: "qr" }));
      await link.waitFor(packet => packet.type === PacketType.CAPTURE_STARTED && packet.captureId === captureId, FRAME_TIMEOUT_MS);
      frames = [await this.readFrame(link, captureId, 0), await this.readFrame(link, captureId, 1)];
      await link.waitFor(packet => packet.type === PacketType.CAPTURE_COMPLETE && packet.captureId === captureId, FRAME_TIMEOUT_MS);
      this.setState("PROCESSING");
      const result = await this.decodeQr(captureId, identity, frames);
      this.setState("READY");
      return result;
    } catch (error) {
      if (this.link === link) this.setState(error instanceof QrNotDetectedError ? "READY" : "ERROR");
      throw error;
    } finally {
      frames.fill(Buffer.alloc(0));
    }
  }

  async capturePreview() {
    if (this.previewCapture) return this.previewCapture;
    const operation = this.capturePreviewFrame();
    this.previewCapture = operation;
    try {
      return await operation;
    } finally {
      if (this.previewCapture === operation) this.previewCapture = undefined;
    }
  }

  private async capturePreviewFrame() {
    const link = this.link;
    const identity = this.identity;
    if (!link || !identity || this.state !== "READY") {
      throw new Error("Hardware camera is not ready");
    }
    const captureId = `preview-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    let frames: Buffer[] = [];
    this.setState("CAPTURING");
    try {
      await link.request(
        PacketType.CAPTURE,
        PacketType.ACK,
        captureId,
        255,
        jsonPayload({ mode: "preview" })
      );
      await link.waitFor(
        packet =>
          packet.type === PacketType.CAPTURE_STARTED &&
          packet.captureId === captureId,
        FRAME_TIMEOUT_MS
      );
      frames = [
        await this.readFrame(link, captureId, 0),
        await this.readFrame(link, captureId, 1),
      ];
      await link.waitFor(
        packet =>
          packet.type === PacketType.CAPTURE_COMPLETE &&
          packet.captureId === captureId,
        FRAME_TIMEOUT_MS
      );
      const frame = frames[0];
      if (
        frame.length < 4 ||
        frame[0] !== 0xff ||
        frame[1] !== 0xd8 ||
        frame.at(-2) !== 0xff ||
        frame.at(-1) !== 0xd9
      ) {
        throw new Error("Hardware camera returned an invalid JPEG preview");
      }
      this.setState("READY");
      return {
        captureId,
        mimeType: "image/jpeg",
        imageBase64: frame.toString("base64"),
        capturedAt: new Date().toISOString(),
        source: `${identity.hardware} USB camera`,
      };
    } catch (error) {
      if (this.link === link) this.setState("ERROR");
      console.warn(
        `[scangate-usb] preview failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
      throw error;
    } finally {
      frames.fill(Buffer.alloc(0));
    }
  }

  private async captureAndIngest(job: CaptureJob) {
    const startedAt = Date.now();
    try {
      const link = this.link;
      const identity = this.identity;
      if (!link || !identity) throw new Error("Scanner disconnected before capture");
      console.info(
        `[scangate-usb] capture=${job.captureId} event=command_sent page=${job.pageNumber ?? "unknown"} state=${this.state}`
      );
      await link.request(PacketType.CAPTURE, PacketType.ACK, job.captureId, 255, jsonPayload({ page_number: job.pageNumber, booklet_ref: job.bookletRef }));
      await link.waitFor(packet => packet.type === PacketType.CAPTURE_STARTED && packet.captureId === job.captureId, FRAME_TIMEOUT_MS);
      this.setState("CAPTURING");
      const frames = [await this.readFrame(link, job.captureId, 0), await this.readFrame(link, job.captureId, 1)];
      console.info(
        `[scangate-usb] capture=${job.captureId} event=frames_received frame_0_bytes=${frames[0].length} frame_1_bytes=${frames[1].length} crc=verified`
      );
      await link.waitFor(packet => packet.type === PacketType.CAPTURE_COMPLETE && packet.captureId === job.captureId, FRAME_TIMEOUT_MS);
      job.state = "PROCESSING";
      job.message = "Frames received. Running the ScanGate quality pipeline.";
      this.setState("PROCESSING");
      job.result = await this.ingest(job, identity, frames);
      const result =
        job.result && typeof job.result === "object" && !Array.isArray(job.result)
          ? (job.result as Record<string, unknown>)
          : null;
      job.state = "COMPLETE";
      job.message = "USB capture processed by ScanGate.";
      job.completedAt = new Date().toISOString();
      this.setState("READY");
      console.info(
        `[scangate-usb] capture=${job.captureId} event=complete status=${String(result?.status ?? "unknown")} elapsed_ms=${Date.now() - startedAt}`
      );
    } catch (error) {
      job.state = "ERROR";
      job.message = error instanceof Error ? error.message : "USB capture failed";
      job.completedAt = new Date().toISOString();
      this.setState("ERROR");
      console.error(
        `[scangate-usb] capture=${job.captureId} event=failed elapsed_ms=${Date.now() - startedAt} error=${job.message}`
      );
    }
  }

  private async receiveUnsolicitedCapture(job: CaptureJob, link: SerialLink) {
    try {
      const identity = this.identity;
      if (!identity) throw new Error("Scanner disconnected before physical capture");
      this.setState("CAPTURING");
      const frames = [await this.readFrame(link, job.captureId, 0), await this.readFrame(link, job.captureId, 1)];
      await link.waitFor(packet => packet.type === PacketType.CAPTURE_COMPLETE && packet.captureId === job.captureId, FRAME_TIMEOUT_MS);
      job.state = "PROCESSING";
      job.message = "Physical capture received. Running the ScanGate quality pipeline.";
      this.setState("PROCESSING");
      job.result = await this.ingest(job, identity, frames);
      job.state = "COMPLETE";
      job.message = "Physical USB capture processed by ScanGate.";
      job.completedAt = new Date().toISOString();
      this.setState("READY");
    } catch (error) {
      job.state = "ERROR";
      job.message = error instanceof Error ? error.message : "Physical USB capture failed";
      job.completedAt = new Date().toISOString();
      this.setState("ERROR");
    }
  }

  private onUnsolicitedPacket(link: SerialLink | undefined, packet: Packet) {
    if (!link || link !== this.link || packet.type !== PacketType.CAPTURE_STARTED || !isValidCaptureId(packet.captureId)) return;
    if (this.jobs.has(packet.captureId)) return;
    const job: CaptureJob = {
      captureId: packet.captureId,
      pageNumber: null,
      bookletRef: "",
      state: "CAPTURING",
      message: "Physical capture started.",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.captureId, job);
    void this.receiveUnsolicitedCapture(job, link);
  }

  private async readFrame(link: SerialLink, captureId: string, frameNumber: number) {
    const started = await link.waitFor(packet => packet.type === PacketType.FRAME_START && packet.captureId === captureId && packet.frameNumber === frameNumber, FRAME_TIMEOUT_MS);
    if (started.payload.length !== 8) { await link.send(PacketType.NACK, captureId, frameNumber, Buffer.from("bad-frame-start")); throw new Error("Invalid frame header from scanner"); }
    const expectedLength = started.payload.readUInt32LE(0);
    const expectedCrc = started.payload.readUInt32LE(4);
    if (!expectedLength || expectedLength > 6 * 1024 * 1024) { await link.send(PacketType.NACK, captureId, frameNumber, Buffer.from("frame-too-large")); throw new Error("Scanner frame exceeds the allowed size"); }
    await link.send(PacketType.ACK, captureId, frameNumber);
    const chunks: Buffer[] = [];
    let received = 0;
    let expectedSequence = 0;
    while (received < expectedLength) {
      const packet = await link.waitFor(item => item.type === PacketType.FRAME_DATA && item.captureId === captureId && item.frameNumber === frameNumber, FRAME_TIMEOUT_MS);
      if (packet.payload.length < 5 || packet.payload.readUInt32LE(0) !== expectedSequence) { await link.send(PacketType.NACK, captureId, frameNumber, Buffer.from("bad-chunk-sequence")); throw new Error("Scanner frame chunk sequence failed"); }
      const data = packet.payload.subarray(4);
      if (!data.length || received + data.length > expectedLength) { await link.send(PacketType.NACK, captureId, frameNumber, Buffer.from("bad-chunk-size")); throw new Error("Scanner frame chunk size failed"); }
      chunks.push(data);
      received += data.length;
      expectedSequence += 1;
      const ack = Buffer.allocUnsafe(4);
      ack.writeUInt32LE(expectedSequence, 0);
      await link.send(PacketType.ACK, captureId, frameNumber, ack);
    }
    const ended = await link.waitFor(packet => packet.type === PacketType.FRAME_END && packet.captureId === captureId && packet.frameNumber === frameNumber, FRAME_TIMEOUT_MS);
    const frame = Buffer.concat(chunks, expectedLength);
    if (ended.payload.length !== 8 || ended.payload.readUInt32LE(0) !== expectedLength || ended.payload.readUInt32LE(4) !== expectedCrc || crc32(frame) !== expectedCrc) { await link.send(PacketType.NACK, captureId, frameNumber, Buffer.from("frame-crc-failed")); throw new Error("Scanner frame checksum failed"); }
    await link.send(PacketType.FRAME_VALID, captureId, frameNumber);
    return frame;
  }

  private async ingest(job: CaptureJob, identity: DeviceInfo, frames: Buffer[]) {
    const form = new FormData();
    form.set("capture_id", job.captureId);
    if (job.pageNumber !== null) form.set("page_number", String(job.pageNumber));
    form.set("booklet_ref", job.bookletRef);
    form.set("frame_0", new Blob([copyForBlob(frames[0])], { type: "image/jpeg" }), "frame_0.jpg");
    form.set("frame_1", new Blob([copyForBlob(frames[1])], { type: "image/jpeg" }), "frame_1.jpg");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(INGEST_URL, { method: "POST", headers: { "X-ScanGate-USB-Agent": INGEST_TOKEN, "X-ScanGate-Device-ID": identity.deviceId }, body: form, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) throw new Error(`ScanGate USB ingestion failed (${response.status})`);
      try { return JSON.parse(body) as unknown; } catch { throw new Error("ScanGate USB ingestion returned invalid JSON"); }
    } finally {
      clearTimeout(timeout);
      frames.fill(Buffer.alloc(0));
    }
  }

  private async decodeQr(captureId: string, identity: DeviceInfo, frames: Buffer[]) {
    const form = new FormData();
    form.set("capture_id", captureId);
    form.set("frame_0", new Blob([copyForBlob(frames[0])], { type: "image/jpeg" }), "frame_0.jpg");
    form.set("frame_1", new Blob([copyForBlob(frames[1])], { type: "image/jpeg" }), "frame_1.jpg");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(QR_DECODE_URL, {
        method: "POST",
        headers: { "X-ScanGate-USB-Agent": INGEST_TOKEN, "X-ScanGate-Device-ID": identity.deviceId },
        body: form,
        signal: controller.signal,
      });
      const value = asJsonRecord(await response.text());
      if (response.status === 422) {
        const detail = typeof value?.detail === "string" ? value.detail : "QR not detected - move the code inside the frame";
        throw new QrNotDetectedError(detail);
      }
      if (!response.ok) throw new Error(`ScanGate QR decoder failed (${response.status})`);
      if (!value || typeof value.payload !== "string" || !value.payload.trim() || value.payload.length > 2048) {
        throw new Error("ScanGate QR decoder returned an invalid payload");
      }
      return {
        payload: value.payload.trim(),
        frameNumber: typeof value.frame_number === "number" ? value.frame_number : null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseIdentity(packet: Packet): DeviceInfo | null {
    const value = parseJsonPayload(packet);
    if (!value || value.device !== "ScanGate" || value.hardware !== "ESP32-S3-N1-S R8" || typeof value.deviceId !== "string" || !value.deviceId || typeof value.firmwareVersion !== "string" || (value.camera !== "available" && value.camera !== "unavailable") || typeof value.status !== "string") return null;
    return value as DeviceInfo;
  }

  private async reconcile(force = false) {
    if (this.reconciling || (!force && Date.now() < this.nextAttemptAt)) return;
    if (!force && (this.state === "CAPTURING" || this.state === "PROCESSING")) return;
    this.reconciling = true;
    try {
      if (this.link) {
        try { await this.ping(); return; } catch { await this.dropLink(); }
      }
      this.setState("CONNECTING");
      const candidates = (await SerialPort.list()).filter(isCandidate).sort((a, b) => a.path.localeCompare(b.path));
      if (!candidates.length) { this.setState("DISCONNECTED"); return; }
      for (const portInfo of candidates) {
        let link: SerialLink | undefined;
        const port = new SerialPort({ path: portInfo.path, baudRate: BAUD_RATE, autoOpen: false, lock: true });
        link = new SerialLink(
          port,
          () => void this.onLinkClosed(link),
          packet => this.onUnsolicitedPacket(link, packet)
        );
        try {
          await link.open();
          const pong = await link.request(PacketType.PING, PacketType.PONG);
          const infoPacket = await link.request(PacketType.GET_DEVICE_INFO, PacketType.DEVICE_INFO);
          const statusPacket = await link.request(PacketType.STATUS, PacketType.STATUS);
          const pongIdentity = this.parseIdentity(pong);
          const info = this.parseIdentity(infoPacket);
          const status = this.parseIdentity(statusPacket);
          if (!pongIdentity || !info || !status || !identityMatches(info, portInfo) || info.deviceId !== pongIdentity.deviceId || info.deviceId !== status.deviceId) {
            console.warn(
              `[scangate-usb] identity check failed on ${portInfo.path}: ` +
              JSON.stringify({
                pong: pongIdentity && { deviceId: pongIdentity.deviceId, camera: pongIdentity.camera, status: pongIdentity.status },
                info: info && { deviceId: info.deviceId, hardware: info.hardware, camera: info.camera, status: info.status },
                status: status && { deviceId: status.deviceId, camera: status.camera, status: status.status },
                checks: {
                  identityMatches: Boolean(info && identityMatches(info, portInfo)),
                  pongMatches: Boolean(info && pongIdentity && info.deviceId === pongIdentity.deviceId),
                  statusMatches: Boolean(info && status && info.deviceId === status.deviceId),
                  portVidPid: `${portInfo.vendorId ?? ""}:${portInfo.productId ?? ""}`,
                },
              })
            );
            await link.close();
            continue;
          }
          this.link = link;
          this.portPath = portInfo.path;
          this.identity = status;
          this.nextAttemptAt = 0;
          this.setState(stateForDevice(status));
          console.info(`[scangate-usb] handshake completed on ${portInfo.path} at ${BAUD_RATE} baud.`);
          return;
        } catch (error) {
          console.warn(
            `[scangate-usb] handshake failed on ${portInfo.path}: ${error instanceof Error ? error.message : "unknown error"}`
          );
          await link.close();
        }
      }
      this.setState("ERROR");
      this.nextAttemptAt = Date.now() + RETRY_BACKOFF_MS;
    } catch (error) {
      console.warn(
        `[scangate-usb] discovery failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
      this.setState("ERROR");
      this.nextAttemptAt = Date.now() + RETRY_BACKOFF_MS;
    } finally { this.reconciling = false; }
  }

  private async onLinkClosed(link: SerialLink | undefined) {
    if (this.link !== link) return;
    this.link = undefined;
    this.portPath = undefined;
    this.identity = undefined;
    this.setState("DISCONNECTED");
  }

  private async dropLink() {
    const link = this.link;
    this.link = undefined;
    this.portPath = undefined;
    this.identity = undefined;
    if (link) await link.close();
    this.setState("DISCONNECTED");
  }

  private setState(next: AgentState) {
    if (this.state === next) return;
    this.state = next;
    console.info(`[scangate-usb] state=${next}`);
  }
}

function copyForBlob(frame: Buffer): ArrayBuffer {
  const copy = new Uint8Array(frame.length);
  copy.set(frame);
  return copy.buffer;
}

function asJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

const agent = new ScanGateUsbAgent();

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk);
    bytes += data.length;
    if (bytes > 16 * 1024) throw new Error("request body too large");
    parts.push(data);
  }
  if (!parts.length) return {};
  const value: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("request body must be an object");
  return value as Record<string, unknown>;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  if (!isLoopback(request.socket.remoteAddress)) return respond(response, 403, { error: "loopback only" });
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  try {
    if (request.method === "GET" && path === "/health") return respond(response, 200, { ok: true, service: "drishti-scangate-usb-agent", baudRate: BAUD_RATE });
    if (request.method === "GET" && path === "/device/status") return respond(response, 200, agent.status());
    if (request.method === "GET" && path === "/device/info") return respond(response, 200, { device: agent.deviceInfo() });
    if (request.method === "POST" && path === "/device/ping") return respond(response, 200, await agent.ping());
    if (request.method === "POST" && path === "/device/reset") return respond(response, 200, await agent.reset());
    if (request.method === "POST" && path === "/preview") return respond(response, 200, await agent.capturePreview());
    if (request.method === "POST" && path === "/qr-capture") return respond(response, 200, await agent.captureQr());
    if (request.method === "POST" && path === "/capture") {
      const body = await readJson(request);
      if (!isValidCaptureId(body.capture_id)) return respond(response, 422, { error: "invalid capture_id" });
      const pageNumber = body.page_number === undefined || body.page_number === null ? null : Number(body.page_number);
      if (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 0)) return respond(response, 422, { error: "invalid page_number" });
      const bookletRef = typeof body.booklet_ref === "string" ? body.booklet_ref : "";
      return respond(response, 202, agent.startCapture({ captureId: body.capture_id, pageNumber, bookletRef }));
    }
    const captureMatch = path.match(/^\/capture\/([A-Za-z0-9._-]{1,64})$/);
    if (request.method === "GET" && captureMatch) {
      const capture = agent.capture(captureMatch[1]);
      return capture ? respond(response, 200, capture) : respond(response, 404, { error: "capture not found" });
    }
    return respond(response, 404, { error: "not found" });
  } catch (error) {
    const status = error instanceof QrNotDetectedError ? 422 : 503;
    return respond(response, status, { error: error instanceof Error ? error.message : "agent error" });
  }
}

const server = createServer((request, response) => void handleRequest(request, response));
server.listen(AGENT_PORT, "127.0.0.1", () => console.info(`[scangate-usb] listening on http://127.0.0.1:${AGENT_PORT}`));
void agent.start();

async function shutdown() { await agent.stop(); server.close(); }
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
