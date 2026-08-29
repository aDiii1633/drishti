import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileUp,
  HardDrive,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  UploadCloud,
  Trash2,
  Usb,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  asDataUrl,
  checkImageClarity,
  checkPdfClarity,
  type ClarityResult,
  type PdfPageEvidence,
} from "@/lib/pdf";
import { trpc } from "@/lib/trpc";

type Source = "camera" | "hardware" | "upload";
type Step = 1 | 2 | 3 | 4;
type PageEvidence = ClarityResult & {
  id: string;
  pageDataUrl: string;
  thumbnailDataUrl: string;
  fileName: string;
  hardwareSessionId?: string;
};

async function createThumbnail(dataUrl: string) {
  return new Promise<string>(resolve => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 240 / image.naturalWidth, 300 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return resolve(dataUrl);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function sessionPage(
  evidence: ClarityResult & { pageDataUrl: string; fileName: string },
  hardwareSessionId?: string
): Promise<PageEvidence> {
  return {
    ...evidence,
    id: crypto.randomUUID(),
    thumbnailDataUrl: await createThumbnail(evidence.pageDataUrl),
    hardwareSessionId,
  };
}

function videoQrFrame(video: HTMLVideoElement) {
  const maxWidth = 1920;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function Stepper({ current }: { current: Step }) {
  const items = [
    { number: 1, label: "Scan QR" },
    { number: 2, label: "Capture" },
    { number: 3, label: "Review" },
    { number: 4, label: "Submit" },
  ];
  return (
    <div className="grid grid-cols-4 border-y border-[#d9eaf3] bg-white">
      {items.map((item, index) => {
        const active = current === item.number;
        const complete = current > item.number;
        return (
          <div
            key={item.number}
            className={`relative flex items-center gap-3 px-3 py-4 sm:px-5 ${active ? "bg-[#eaf6fd]" : ""}`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${complete ? "border-[#2f7898] bg-[#2f7898] text-white" : active ? "border-[#2f7898] bg-white text-[#2f6f95]" : "border-[#c9e2ef] text-[#7f9aaa]"}`}
            >
              {complete ? <Check size={15} /> : item.number}
            </span>
            <span
              className={`hidden text-xs font-semibold sm:block ${active ? "text-[#2f6f95]" : complete ? "text-[#587181]" : "text-[#91a4af]"}`}
            >
              {item.label}
            </span>
            {index < items.length - 1 ? (
              <ChevronRight
                size={14}
                className="absolute right-1 text-[#b7cbd5] sm:right-2"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SourceOption({
  source,
  selected,
  onClick,
}: {
  source: Source;
  selected: boolean;
  onClick: () => void;
}) {
  const details = {
    camera: {
      icon: Camera,
      title: "Camera",
      description: "Capture using this device",
    },
    hardware: {
      icon: HardDrive,
      title: "Hardware",
      description: "Use a connected scanner",
    },
    upload: {
      icon: FileUp,
      title: "Upload",
      description: "Use an existing answer sheet",
    },
  }[source];
  const Icon = details.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex min-h-[104px] flex-1 items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${selected ? "border-[#75afd0] bg-[#eaf6fd]" : "border-[#d9eaf3] bg-white hover:border-[#8fc7e8]"}`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#2f7898] text-white" : "bg-[#f1f8fc] text-[#2f6f95]"}`}
      >
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{details.title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6b8190]">
          {details.description}
        </span>
      </span>
    </button>
  );
}

type QrLookup = {
  paper: {
    id: string;
    subject: string;
    subjectCode: string;
    paperCode: string;
    setNumber: string | null;
    bundleLabel: string | null;
    expectedQuestionCount: number;
  };
  session: { name: string; code: string };
  scheme: {
    maximumMarks: number;
    questionCount: number;
    version: string;
  } | null;
};

function DetailsCard({ lookup }: { lookup: QrLookup }) {
  const { paper, session, scheme } = lookup;
  return (
    <div className="mt-5 rounded-2xl border border-[#b9dfc9] bg-[#f5fcf7] p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#28734b]">
        <CheckCircle2 size={18} /> QR verified
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <span className="block text-xs text-[#6b8190]">Exam session</span>
          <span className="font-medium">
            {session.name} · {session.code}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Subject</span>
          <span className="font-medium">
            {paper.subject} · {paper.subjectCode}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Paper code</span>
          <span className="font-medium">{paper.paperCode}</span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Set / bundle</span>
          <span className="font-medium">
            {paper.setNumber ?? "Not set"} · {paper.bundleLabel ?? paper.id}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Question set</span>
          <span className="font-medium">
            {scheme
              ? `${scheme.questionCount} questions · ${scheme.maximumMarks} marks`
              : "Not attached"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">
            Configured version
          </span>
          <span className="font-mono text-xs">
            {scheme?.version ?? "Unavailable"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Questions</span>
          <span className="font-medium">
            {paper.expectedQuestionCount ??
              scheme?.maximumMarks ??
              "Not returned"}
          </span>
        </div>
        <div>
          <span className="block text-xs text-[#6b8190]">Bundle ID</span>
          <span className="font-mono text-xs font-medium">{paper.id}</span>
        </div>
      </div>
    </div>
  );
}

function QualityBadge({ page }: { page: PageEvidence }) {
  const clear = page.clarity === "CLEAR";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${clear ? "bg-[#e5f4ec] text-[#28734b]" : "bg-[#fff0ee] text-[#b64c40]"}`}
    >
      {clear ? "Clear" : "Quality failed"}
    </span>
  );
}

type FrameDimensions = { width: number; height: number };
type FovCalibration = {
  distanceMm: number;
  sceneWidthMm: number;
  sceneHeightMm: number;
  orientation: "portrait" | "landscape";
};

const CAMERA_FOV_CALIBRATION_KEY = "drishti.camera-fov-calibration.v1";

function validCalibration(value: unknown): value is FovCalibration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const calibration = value as Record<string, unknown>;
  return (
    typeof calibration.distanceMm === "number" &&
    calibration.distanceMm > 0 &&
    typeof calibration.sceneWidthMm === "number" &&
    calibration.sceneWidthMm > 0 &&
    typeof calibration.sceneHeightMm === "number" &&
    calibration.sceneHeightMm > 0 &&
    (calibration.orientation === "portrait" ||
      calibration.orientation === "landscape")
  );
}

function approximateFov(coverageMm: number, distanceMm: number) {
  return (2 * Math.atan(coverageMm / (2 * distanceMm)) * 180) / Math.PI;
}

function DeveloperFovCalibration({
  frame,
  calibration,
  onSave,
}: {
  frame: FrameDimensions | null;
  calibration: FovCalibration | null;
  onSave: (value: FovCalibration) => void;
}) {
  const [distanceMm, setDistanceMm] = useState(
    calibration?.distanceMm ? String(calibration.distanceMm) : ""
  );
  const [sceneWidthMm, setSceneWidthMm] = useState(
    calibration?.sceneWidthMm ? String(calibration.sceneWidthMm) : ""
  );
  const [sceneHeightMm, setSceneHeightMm] = useState(
    calibration?.sceneHeightMm ? String(calibration.sceneHeightMm) : ""
  );
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    calibration?.orientation ?? "portrait"
  );
  const distance = Number(distanceMm);
  const sceneWidth = Number(sceneWidthMm);
  const sceneHeight = Number(sceneHeightMm);
  const ready = distance > 0 && sceneWidth > 0 && sceneHeight > 0;

  useEffect(() => {
    if (!calibration) return;
    setDistanceMm(String(calibration.distanceMm));
    setSceneWidthMm(String(calibration.sceneWidthMm));
    setSceneHeightMm(String(calibration.sceneHeightMm));
    setOrientation(calibration.orientation);
  }, [calibration]);

  return (
    <details className="border-t border-white/10 bg-[#0b1d28] px-3 py-2 text-[11px] text-white/70">
      <summary className="cursor-pointer font-semibold text-[#b7ddec]">
        Developer FOV calibration
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="block text-white/55">Camera distance (mm)</span>
          <input
            type="number"
            min="1"
            value={distanceMm}
            onChange={event => setDistanceMm(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-white/15 bg-white/5 px-2 text-white outline-none"
          />
        </label>
        <label>
          <span className="block text-white/55">Visible scene width (mm)</span>
          <input
            type="number"
            min="1"
            value={sceneWidthMm}
            onChange={event => setSceneWidthMm(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-white/15 bg-white/5 px-2 text-white outline-none"
          />
        </label>
        <label>
          <span className="block text-white/55">Visible scene height (mm)</span>
          <input
            type="number"
            min="1"
            value={sceneHeightMm}
            onChange={event => setSceneHeightMm(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-white/15 bg-white/5 px-2 text-white outline-none"
          />
        </label>
        <label>
          <span className="block text-white/55">A4 orientation in frame</span>
          <select
            value={orientation}
            onChange={event =>
              setOrientation(event.target.value as "portrait" | "landscape")
            }
            className="mt-1 h-9 w-full rounded-md border border-white/15 bg-[#102737] px-2 text-white outline-none"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p>
          Frame {frame ? `${frame.width} × ${frame.height}` : "not loaded"}
          {ready
            ? ` · approximate FOV ${approximateFov(sceneWidth, distance).toFixed(1)}° × ${approximateFov(sceneHeight, distance).toFixed(1)}°`
            : " · enter measured coverage to calculate FOV"}
        </p>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onSave({
              distanceMm: distance,
              sceneWidthMm: sceneWidth,
              sceneHeightMm: sceneHeight,
              orientation,
            })
          }
          className="rounded-md bg-[#8fc7e8] px-3 py-2 font-semibold text-[#102737] disabled:opacity-40"
        >
          Save calibration
        </button>
      </div>
    </details>
  );
}

function HardwareCameraPreview({
  image,
  capturedAt,
  source,
  connected,
  loading,
  status,
  onRefresh,
  resultImage = false,
}: {
  image: string;
  capturedAt: string;
  source: string;
  connected: boolean;
  loading: boolean;
  status: string;
  onRefresh: () => void;
  resultImage?: boolean;
}) {
  const [frameDimensions, setFrameDimensions] = useState<FrameDimensions | null>(
    null
  );
  const [calibration, setCalibration] = useState<FovCalibration | null>(null);
  const calibrationEnabled =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("cameraCalibration") === "1";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAMERA_FOV_CALIBRATION_KEY);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (validCalibration(stored)) setCalibration(stored);
    } catch {
      // A missing or malformed developer calibration falls back to geometry-only guidance.
    }
  }, []);

  useEffect(() => {
    if (!image) setFrameDimensions(null);
  }, [image]);

  const saveCalibration = (value: FovCalibration) => {
    setCalibration(value);
    window.localStorage.setItem(CAMERA_FOV_CALIBRATION_KEY, JSON.stringify(value));
  };
  const frameAspect = frameDimensions
    ? `${frameDimensions.width} / ${frameDimensions.height}`
    : "4 / 3";

  return (
    <div className="rounded-2xl border border-[#375568] bg-[#102737] text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
        <div>
          <p className="mono-label text-white/55">Hardware camera</p>
          <p className="mt-1 text-sm font-semibold">
            {resultImage
              ? "Current ScanGate capture"
              : "Actual ESP32 camera frame"}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-[#84d1a4]" : "bg-[#e4776b]"}`}
          />
          ESP32 {connected ? "connected" : "disconnected"}
        </span>
      </div>
      <div
        className="relative mx-auto w-full border border-[#5f9abb]/70 bg-[#0b1d28]"
        style={{ aspectRatio: frameAspect }}
      >
        {image ? (
          <img
            src={image}
            alt={
              resultImage
                ? "Current answer sheet processed by ScanGate"
                : "Actual frame from the connected ESP32 camera"
            }
            onLoad={event => {
              const target = event.currentTarget;
              if (target.naturalWidth && target.naturalHeight) {
                setFrameDimensions({
                  width: target.naturalWidth,
                  height: target.naturalHeight,
                });
              }
            }}
            className="absolute inset-0 h-full w-full object-contain object-center"
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              {loading ? (
                <Loader2 className="mx-auto animate-spin text-[#8fc7e8]" size={30} />
              ) : (
                <CameraOff className="mx-auto text-[#8fc7e8]" size={30} />
              )}
              <p className="mt-3 text-sm font-semibold">
                {loading
                  ? "Requesting a real ESP32 frame..."
                  : connected
                    ? "Refresh to request a hardware frame"
                    : "Hardware camera unavailable"}
              </p>
            </div>
          </div>
        )}
        <span className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92%] -translate-x-1/2 truncate rounded-full bg-[#102737]/85 px-3 py-1 text-[10px] font-semibold">
          {resultImage
            ? "Current captured page"
            : "Full ESP32 camera frame visible"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#b7ddec]">{status}</p>
          <p className="mt-1 truncate text-[10px] text-white/55">
            {resultImage
              ? "Enhanced image from the current capture session"
              : capturedAt
              ? `Hardware frame ${new Date(capturedAt).toLocaleTimeString()} · ${frameDimensions ? `${frameDimensions.width} × ${frameDimensions.height} · ` : ""}${source}`
              : "Preview uses periodic USB still frames, not the laptop camera."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!connected || loading || resultImage}
          className="press inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh frame
        </button>
      </div>
      {calibrationEnabled ? (
        <DeveloperFovCalibration
          frame={frameDimensions}
          calibration={calibration}
          onSave={saveCalibration}
        />
      ) : null}
    </div>
  );
}

export default function ScannerWorkspace() {
  const [source, setSource] = useState<Source | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [qrPayload, setQrPayload] = useState("");
  const [qrRequest, setQrRequest] = useState("");
  const [qrStatus, setQrStatus] = useState<
    | "idle"
    | "scanning"
    | "not_detected"
    | "verifying"
    | "verified"
    | "invalid"
  >("idle");
  const [qrFeedback, setQrFeedback] = useState("Scanning for QR...");
  const [qrImagePreview, setQrImagePreview] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<"qr" | "answer" | null>(null);
  const [cameraFrameDimensions, setCameraFrameDimensions] =
    useState<FrameDimensions>({ width: 4, height: 3 });
  const [videoDeviceId, setVideoDeviceId] = useState("");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [hardwareSessionId, setHardwareSessionId] = useState<string | null>(
    null
  );
  const [testHardwareStatus, setTestHardwareStatus] = useState<
    "OK" | "BLUR" | "CHOP" | "GLARE" | "SYSTEM_ERROR"
  >("OK");
  const [testUsbState, setTestUsbState] = useState<
    "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "READY" | "ERROR"
  >("DISCONNECTED");
  const [pages, setPages] = useState<PageEvidence[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [retakePageId, setRetakePageId] = useState<string | null>(null);
  const [pendingDeletePageId, setPendingDeletePageId] = useState<string | null>(
    null
  );
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [hardwarePreview, setHardwarePreview] = useState({
    image: "",
    capturedAt: "",
    source: "",
  });
  const [hardwarePreviewError, setHardwarePreviewError] = useState("");
  const [capturedBundleId, setCapturedBundleId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileMeta, setFileMeta] = useState<{
    size: number;
    type: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectingRef = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileRef = useRef<HTMLInputElement>(null);
  const qrFileRef = useRef<HTMLInputElement>(null);
  const hardwarePreviewReadyRef = useRef(false);
  const hardwarePreviewBusyRef = useRef(false);
  const hardwarePreviewLastStartedRef = useRef(0);
  const hardwarePreviewTimerRef = useRef<number | null>(null);
  const hardwarePreviewMutateRef = useRef<
    () => Promise<{ image: string; capturedAt: string; source: string }>
  >(async () => ({ image: "", capturedAt: "", source: "" }));

  const paperLookup = trpc.exam.resolveQr.useQuery(
    { payload: qrRequest || "pending-payload" },
    { enabled: Boolean(qrRequest), retry: false }
  );
  const history = trpc.bundles.list.useQuery(undefined, {
    enabled: Boolean(capturedBundleId),
    refetchInterval: 5_000,
  });
  const hardwareConnection = trpc.hardware.status.useQuery(undefined, {
    enabled: source === "hardware",
    retry: false,
    refetchInterval: source === "hardware" ? 5_000 : false,
  });
  const usbConnection = trpc.hardware.usbStatus.useQuery(undefined, {
    enabled: source === "hardware",
    retry: false,
    refetchInterval: source === "hardware" ? 2_000 : false,
  });
  const hardwareCapture = trpc.hardware.poll.useQuery(
    { sessionId: hardwareSessionId ?? "00000000-0000-4000-8000-000000000000" },
    {
      enabled:
        source === "hardware" && step === 2 && Boolean(hardwareSessionId),
      retry: false,
      refetchInterval:
        source === "hardware" && step === 2 && hardwareSessionId
          ? 2_000
          : false,
    }
  );
  const capture = trpc.bundles.captureImage.useMutation();
  const appendCapture = trpc.bundles.appendCapture.useMutation();
  const decodeQrImage = trpc.exam.decodeQrImage.useMutation();
  const hardwarePreviewCapture = trpc.hardware.preview.useMutation({
    onSuccess: result => {
      setHardwarePreview(result);
      setHardwarePreviewError("");
    },
    onError: error => setHardwarePreviewError(error.message),
    onSettled: () => {
      hardwarePreviewBusyRef.current = false;
    },
  });
  hardwarePreviewMutateRef.current = hardwarePreviewCapture.mutateAsync;
  const hardwareQrScan = trpc.hardware.scanQr.useMutation();
  const decodeQrImageRef = useRef(decodeQrImage.mutateAsync);
  decodeQrImageRef.current = decodeQrImage.mutateAsync;
  const armHardware = trpc.hardware.arm.useMutation({
    onSuccess: result => {
      setHardwareSessionId(result.sessionId);
      toast.success("Hardware capture started.");
    },
    onError: error => toast.error(error.message),
  });
  const testHardwareCapture = trpc.hardware.testCapture.useMutation({
    onSuccess: () => void hardwareCapture.refetch(),
    onError: error => toast.error(error.message),
  });
  const retryUsb = trpc.hardware.retryUsb.useMutation({
    onSuccess: () => void usbConnection.refetch(),
    onError: error => toast.error(error.message),
  });
  const setTestUsbConnection = trpc.hardware.setTestUsbState.useMutation({
    onSuccess: () => void usbConnection.refetch(),
    onError: error => toast.error(error.message),
  });
  const persistHardwareCapture = trpc.hardware.persist.useMutation();
  const appendHardwareCapture = trpc.hardware.append.useMutation();
  const submitCapture = trpc.bundles.submitCapture.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      setStep(4);
      void history.refetch();
      toast.success("Answer sheet submitted for evaluation.");
    },
    onError: error => toast.error(error.message),
  });

  hardwarePreviewReadyRef.current = Boolean(
    usbConnection.data?.ready &&
      !usbConnection.data.testMode &&
      !hardwareSessionId &&
      !armHardware.isPending
  );

  const refreshHardwarePreview = useCallback(() => {
    if (
      !hardwarePreviewReadyRef.current ||
      hardwarePreviewBusyRef.current
    ) {
      return;
    }
    hardwarePreviewBusyRef.current = true;
    hardwarePreviewLastStartedRef.current = Date.now();
    void hardwarePreviewMutateRef.current().catch(() => undefined);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraMode(null);
  }, []);

  const listCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      device => device.kind === "videoinput"
    );
    setVideoDevices(devices);
    if (!videoDeviceId && devices[0]) setVideoDeviceId(devices[0].deviceId);
  }, [videoDeviceId]);

  const startStream = useCallback(
    async (mode: "qr" | "answer") => {
      setCameraError(null);
      if (!window.isSecureContext && location.hostname !== "localhost") {
        setCameraError(
          "Camera access needs a secure connection (HTTPS) or localhost."
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser does not provide camera access.");
        return;
      }
      stopStream();
      try {
        const video: MediaTrackConstraints = videoDeviceId
          ? {
              deviceId: { exact: videoDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };
        const stream = await navigator.mediaDevices.getUserMedia({
          video,
          audio: false,
        });
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { focusMode?: string[] })
          | undefined;
        if (track && capabilities?.focusMode?.includes("continuous")) {
          await track
            .applyConstraints({
              advanced: [
                { focusMode: "continuous" } as MediaTrackConstraintSet,
              ],
            })
            .catch(() => undefined);
        }
        setCameraMode(mode);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
            setCameraFrameDimensions({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
          }
        }
        await listCameras();
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the browser and retry."
            : error instanceof DOMException && error.name === "NotFoundError"
              ? "No camera was found on this device. Use Upload instead."
              : "The camera could not be opened. Check the selected device and retry.";
        setCameraError(message);
        stopStream();
      }
    },
    [listCameras, stopStream, videoDeviceId]
  );

  useEffect(() => () => stopStream(), [stopStream]);

  useEffect(() => {
    if (
      source !== "hardware" ||
      (step !== 1 && step !== 2) ||
      usbConnection.data?.testMode ||
      hardwareSessionId
    ) {
      if (hardwarePreviewTimerRef.current !== null) {
        window.clearTimeout(hardwarePreviewTimerRef.current);
        hardwarePreviewTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const schedule = (delay: number) => {
      if (cancelled) return;
      if (hardwarePreviewTimerRef.current !== null) {
        window.clearTimeout(hardwarePreviewTimerRef.current);
      }
      hardwarePreviewTimerRef.current = window.setTimeout(run, delay);
    };
    const run = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - hardwarePreviewLastStartedRef.current;
      if (elapsed < 20_000) {
        schedule(20_000 - elapsed);
        return;
      }
      if (
        !hardwarePreviewReadyRef.current ||
        hardwarePreviewBusyRef.current
      ) {
        schedule(1_000);
        return;
      }
      hardwarePreviewBusyRef.current = true;
      hardwarePreviewLastStartedRef.current = Date.now();
      let nextDelay = 20_000;
      try {
        await hardwarePreviewMutateRef.current();
      } catch {
        // Mutation callbacks surface the actionable status in the preview.
        hardwarePreviewLastStartedRef.current = 0;
        nextDelay = 3_000;
      } finally {
        hardwarePreviewBusyRef.current = false;
        schedule(nextDelay);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (hardwarePreviewTimerRef.current !== null) {
        window.clearTimeout(hardwarePreviewTimerRef.current);
        hardwarePreviewTimerRef.current = null;
      }
    };
  }, [
    armHardware.isPending,
    hardwareSessionId,
    pages.length,
    qrRequest,
    retakePageId,
    source,
    step,
    usbConnection.data?.testMode,
  ]);

  const verifyPayload = useCallback(
    (payload: string) => {
      const clean = payload.trim();
      if (!clean) return;
      stopStream();
      setQrFeedback("QR detected. Verifying with Drishti...");
      setQrStatus("verifying");
      setQrRequest(clean);
    },
    [stopStream]
  );

  useEffect(() => {
    if (!qrRequest) return;
    setQrStatus(
      paperLookup.isFetching
        ? "verifying"
        : paperLookup.isError
          ? "invalid"
          : paperLookup.data
            ? "verified"
            : "verifying"
    );
    if (!paperLookup.isFetching && paperLookup.data) {
      setQrFeedback("QR verified.");
    }
  }, [
    paperLookup.data,
    paperLookup.isError,
    paperLookup.isFetching,
    qrRequest,
  ]);

  useEffect(() => {
    if (cameraMode !== "qr" || qrStatus !== "scanning" || detectingRef.current)
      return;
    let cancelled = false;
    let timer = 0;
    const detect = async () => {
      detectingRef.current = true;
      try {
        const video = videoRef.current;
        if (!cancelled && video && video.readyState >= 2) {
          const decoded = await decodeQrImageRef.current({
            image: videoQrFrame(video),
          });
          if (decoded.detected && decoded.payload) {
            verifyPayload(decoded.payload);
            return;
          }
          setQrFeedback(decoded.message);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "QR not detected.";
          setQrFeedback(
            /temporarily unavailable/i.test(message)
              ? message
              : "QR not detected - move closer, hold steady, enlarge the code, or reduce screen glare."
          );
        }
      } finally {
        detectingRef.current = false;
      }
      if (!cancelled) timer = window.setTimeout(() => void detect(), 850);
    };
    void detect();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cameraMode, qrStatus, verifyPayload]);

  const chooseSource = async (next: Source) => {
    stopStream();
    setSource(next);
    setPages([]);
    setSelectedPageId(null);
    setRetakePageId(null);
    setPendingDeletePageId(null);
    setPreviewUrls([]);
    setHardwarePreview({ image: "", capturedAt: "", source: "" });
    setHardwarePreviewError("");
    setCapturedBundleId(null);
    setHardwareSessionId(null);
    setSubmitted(false);
    setQrPayload("");
    setQrRequest("");
    setQrImagePreview("");
    setQrFeedback("Scanning for QR...");
    setQrStatus("idle");
    setStep(1);
    setQrStatus("scanning");
    if (next === "camera") await startStream("qr");
  };

  const scanHardwareQr = async () => {
    setQrStatus("scanning");
    setQrFeedback("Capturing QR with the ESP32 hardware camera...");
    try {
      const result = await hardwareQrScan.mutateAsync();
      if (!result.detected || !result.payload) {
        throw new Error(result.message);
      }
      verifyPayload(result.payload);
    } catch (error) {
      setQrStatus("not_detected");
      setQrFeedback(
        error instanceof Error
          ? error.message
          : "The hardware camera could not detect a QR."
      );
    } finally {
      void usbConnection.refetch();
      void hardwareConnection.refetch();
    }
  };

  const scanUploadedQr = async (file: File) => {
    if (!file.type.match(/^image\/(?:jpeg|png)$/)) {
      toast.error("Choose a JPG or PNG QR image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("The QR image must be 8 MB or smaller.");
      return;
    }
    setQrStatus("scanning");
    setQrFeedback("Scanning the uploaded image for QR...");
    try {
      const image = await asDataUrl(file);
      setQrImagePreview(image);
      const result = await decodeQrImage.mutateAsync({ image });
      if (!result.detected || !result.payload) {
        throw new Error(result.message);
      }
      verifyPayload(result.payload);
    } catch (error) {
      setQrStatus("not_detected");
      setQrFeedback(
        error instanceof Error
          ? error.message
          : "QR not detected in the uploaded image."
      );
    }
  };

  const continueAfterQr = async () => {
    if (!paperLookup.data || !source) return;
    setStep(2);
    if (source === "camera") await startStream("answer");
  };

  const beginHardwareCapture = () => {
    if (!paperLookup.data || armHardware.isPending) return;
    if (hardwarePreviewTimerRef.current !== null) {
      window.clearTimeout(hardwarePreviewTimerRef.current);
      hardwarePreviewTimerRef.current = null;
    }
    hardwarePreviewReadyRef.current = false;
    armHardware.mutate({
      paperId: paperLookup.data.paper.id,
      intakeQrToken: paperLookup.data.token,
      pageNumber:
        pages.find(page => page.id === retakePageId)?.pageNumber ??
        pages.length + 1,
    });
  };

  const retryHardwareCapture = () => {
    hardwarePreviewLastStartedRef.current = Date.now();
    setHardwareSessionId(null);
    void usbConnection.refetch();
    void hardwareConnection.refetch();
  };

  useEffect(() => {
    if (step !== 1 || qrStatus !== "verified" || !paperLookup.data || !source)
      return;
    const timer = window.setTimeout(() => {
      setStep(2);
      if (source === "camera") void startStream("answer");
    }, 1_400);
    return () => window.clearTimeout(timer);
  }, [paperLookup.data, qrStatus, source, startStream, step]);

  const resetToQr = async () => {
    stopStream();
    setPages([]);
    setSelectedPageId(null);
    setRetakePageId(null);
    setPendingDeletePageId(null);
    setPreviewUrls([]);
    setCapturedBundleId(null);
    setHardwareSessionId(null);
    setHardwarePreview({ image: "", capturedAt: "", source: "" });
    setHardwarePreviewError("");
    setFileName("");
    setFileMeta(null);
    setStep(1);
    setQrStatus("scanning");
    setQrFeedback("Scanning for QR...");
    setQrImagePreview("");
    if (source === "camera") await startStream("qr");
  };

  const addPages = (items: PageEvidence[]) => {
    if (!items.length) return;
    setPages(current => {
      const replacementIndex = retakePageId
        ? current.findIndex(page => page.id === retakePageId)
        : -1;
      const next =
        replacementIndex >= 0
          ? [
              ...current.slice(0, replacementIndex),
              ...items,
              ...current.slice(replacementIndex + 1),
            ]
          : [...current, ...items];
      return next.map((page, index) => ({ ...page, pageNumber: index + 1 }));
    });
    setSelectedPageId(items[0].id);
    setRetakePageId(null);
    setPendingDeletePageId(null);
    setPreviewUrls(items.map(item => item.thumbnailDataUrl));
    setStep(3);
  };

  const captureMore = async () => {
    stopStream();
    setRetakePageId(null);
    setPendingDeletePageId(null);
    hardwarePreviewLastStartedRef.current = Date.now();
    setHardwareSessionId(null);
    setStep(2);
    if (source === "camera") await startStream("answer");
  };

  const retakeSelectedPage = async () => {
    const selected = pages.find(page => page.id === selectedPageId) ?? pages[0];
    if (!selected) return;
    stopStream();
    setRetakePageId(selected.id);
    setPendingDeletePageId(null);
    hardwarePreviewLastStartedRef.current = Date.now();
    setHardwareSessionId(null);
    setStep(2);
    if (source === "camera") await startStream("answer");
  };

  const deletePage = (pageId: string) => {
    if (pendingDeletePageId !== pageId) {
      setPendingDeletePageId(pageId);
      return;
    }
    const index = pages.findIndex(page => page.id === pageId);
    const next = pages
      .filter(page => page.id !== pageId)
      .map((page, pageIndex) => ({ ...page, pageNumber: pageIndex + 1 }));
    setPages(next);
    setPendingDeletePageId(null);
    if (selectedPageId === pageId) {
      setSelectedPageId(next[Math.min(Math.max(index, 0), next.length - 1)]?.id ?? null);
    }
    if (!next.length) setStep(2);
  };

  const prepareFiles = async (files: File[]) => {
    if (!paperLookup.data)
      return toast.error(
        "Verify the bundle QR before choosing an answer sheet."
      );
    if (!files.length) return;
    const pdfFiles = files.filter(file => file.type === "application/pdf");
    const imageFiles = files.filter(file =>
      ["image/jpeg", "image/png"].includes(file.type)
    );
    if (pdfFiles.length && (files.length > 1 || imageFiles.length)) {
      return toast.error(
        "Choose one PDF or multiple JPG/PNG images, not both together."
      );
    }
    if (
      pdfFiles.length !== files.length &&
      imageFiles.length !== files.length
    ) {
      return toast.error("Use a PDF, JPG, JPEG, or PNG answer sheet.");
    }

    const isPdf = pdfFiles.length === 1;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    setFileName(
      isPdf
        ? files[0].name
        : `${files.length} answer-sheet image${files.length === 1 ? "" : "s"}`
    );
    setFileMeta({
      size: totalSize,
      type: isPdf ? "application/pdf" : "image set",
    });
    try {
      if (isPdf) {
        const evidence: PdfPageEvidence[] = await checkPdfClarity(files[0]);
        if (retakePageId && evidence.length !== 1) {
          return toast.error("Choose one image to retake a single page.");
        }
        addPages(
          await Promise.all(
            evidence.map(item =>
              sessionPage({ ...item, fileName: files[0].name })
            )
          )
        );
      } else {
        const evidence = await Promise.all(
          files.map(async (file, index) => {
            const result = await checkImageClarity(file, index + 1);
            const dataUrl = await asDataUrl(file);
            return sessionPage({
              ...result,
              pageDataUrl: dataUrl,
              fileName: file.name,
            });
          })
        );
        if (retakePageId && evidence.length !== 1) {
          return toast.error("Choose one image to retake a single page.");
        }
        addPages(evidence);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The answer sheet could not be read."
      );
    }
  };

  const prepareFile = async (file: File) => prepareFiles([file]);

  const captureAnswerPhoto = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth)
      return toast.error("Camera preview is not ready.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      blob => {
        if (!blob) return toast.error("The camera did not produce an image.");
        const file = new File([blob], `camera-page-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        void prepareFile(file);
        stopStream();
      },
      "image/jpeg",
      0.9
    );
  };

  const reviewHardwareCapture = async () => {
    const result = hardwareCapture.data;
    if (!result?.accepted || !result.enhancedPreview || !hardwareSessionId) {
      return toast.error(
        "Wait for an accepted hardware scan before opening the preview."
      );
    }
    setFileName("ScanGate hardware capture");
    setFileMeta(null);
    addPages([
      await sessionPage(
        {
        pageNumber: result.pageNumber,
        clarity: "CLEAR",
        laplacianVariance: 0,
        reason: "ScanGate quality check accepted the capture.",
        pageDataUrl: result.enhancedPreview,
        fileName: "ScanGate enhanced preview",
        },
        hardwareSessionId
      ),
    ]);
  };

  const submitPages = async () => {
    const selectedSource = source;
    if (!paperLookup.data || !selectedSource)
      return toast.error("Verify the bundle QR first.");
    if (!pages.length)
      return toast.error("Capture or choose an answer sheet first.");
    const failed = pages.filter(page => page.clarity !== "CLEAR");
    if (failed.length)
      return toast.error(
        "Quality check failed. Retake or replace every flagged page before submitting."
      );
    try {
      if (selectedSource === "hardware") {
        const hardwarePages = pages.filter(page => page.hardwareSessionId);
        if (hardwarePages.length !== pages.length) {
          return toast.error("One or more hardware pages are no longer available.");
        }
        const created = await persistHardwareCapture.mutateAsync({
          sessionId: hardwarePages[0].hardwareSessionId!,
        });
        setCapturedBundleId(created.id);
        for (const page of hardwarePages.slice(1)) {
          await appendHardwareCapture.mutateAsync({
            sessionId: page.hardwareSessionId!,
            bundleId: created.id,
          });
        }
        await submitCapture.mutateAsync({ bundleId: created.id });
        return;
      }
      const first = pages[0];
      const created = await capture.mutateAsync({
        candidateName: "Pending identity extraction",
        subject: paperLookup.data.paper.subject,
        paperId: paperLookup.data.paper.id,
        intakeQrToken: paperLookup.data.token,
        source:
          selectedSource === "upload"
            ? fileMeta?.type === "image set"
              ? "image"
              : "pdf"
            : selectedSource,
        idempotencyKey: idempotencyKey.current,
        device:
          selectedSource === "camera" ? "browser camera" : "browser upload",
        image: first.pageDataUrl,
        clarity: first.clarity,
        laplacianVariance: first.laplacianVariance,
        reason: first.reason,
      });
      setCapturedBundleId(created.id);
      for (const page of pages.slice(1)) {
        await appendCapture.mutateAsync({
          bundleId: created.id,
          image: page.pageDataUrl,
          clarity: page.clarity,
          laplacianVariance: page.laplacianVariance,
          reason: page.reason,
        });
      }
      await submitCapture.mutateAsync({ bundleId: created.id });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The answer sheet could not be stored."
      );
    }
  };

  const storeBlockers = [
    !paperLookup.data ? "Verify the bundle QR first." : null,
    !pages.length ? "Capture or choose an answer sheet first." : null,
    pages.some(page => page.clarity !== "CLEAR")
      ? `${pages.filter(page => page.clarity !== "CLEAR").length} page${pages.filter(page => page.clarity !== "CLEAR").length === 1 ? "" : "s"} need a clear replacement.`
      : null,
  ].filter((message): message is string => Boolean(message));
  const selectedPage =
    pages.find(page => page.id === selectedPageId) ?? pages[0] ?? null;
  const submissionPending =
    capture.isPending ||
    appendCapture.isPending ||
    persistHardwareCapture.isPending ||
    appendHardwareCapture.isPending ||
    submitCapture.isPending;
  const hardwareTransportReady =
    hardwareQrScan.isPending ||
    usbConnection.data?.ready ||
    usbConnection.data?.state === "CAPTURING" ||
    usbConnection.data?.state === "PROCESSING";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mono-label text-[#2f6f95]">Scanner workspace</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">
            Scan answer sheet
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
            Choose how the sheet arrives. Drishti verifies the bundle QR before
            any page is captured.
          </p>
        </div>
        {source ? (
          <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 text-xs font-semibold text-[#2f6f95]">
            {source === "hardware"
              ? "Hardware"
              : source === "camera"
                ? "Camera"
                : "Upload"}
          </span>
        ) : null}
      </div>

      <div className="mt-7 overflow-hidden rounded-3xl border border-[#d9eaf3] bg-white shadow-[0_14px_38px_rgba(31,79,105,0.06)]">
        <div className="p-5 sm:p-7">
          <p className="mono-label text-[#6b8190]">Choose input method</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <SourceOption
              source="camera"
              selected={source === "camera"}
              onClick={() => void chooseSource("camera")}
            />
            <SourceOption
              source="hardware"
              selected={source === "hardware"}
              onClick={() => void chooseSource("hardware")}
            />
            <SourceOption
              source="upload"
              selected={source === "upload"}
              onClick={() => void chooseSource("upload")}
            />
          </div>
        </div>
        <Stepper current={step} />

        <div className="p-5 sm:p-7">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={event => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length) void prepareFiles(files);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={qrFileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              if (file) void scanUploadedQr(file);
              event.currentTarget.value = "";
            }}
          />
          {!source ? (
            <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-[#c9e2ef] bg-[#f8fcff] p-8 text-center">
              <div>
                <ScanLine className="mx-auto text-[#75afd0]" size={30} />
                <h2 className="mt-4 text-lg font-semibold">
                  Choose Camera, Hardware, or Upload
                </h2>
                <p className="mt-2 text-sm text-[#6b8190]">
                  The next step is always scanning the bundle QR.
                </p>
              </div>
            </div>
          ) : step === 1 ? (
            <div>
              {source === "hardware" &&
              !hardwareQrScan.isPending &&
              (usbConnection.isLoading ||
                !hardwareTransportReady ||
                hardwareConnection.isLoading) ? (
                <div
                  className={`rounded-2xl border p-5 ${usbConnection.isLoading || hardwareConnection.isLoading ? "border-[#c9e2ef] bg-[#f8fcff]" : "border-[#f1c8c3] bg-[#fff8f7]"}`}
                >
                  <div className="flex items-start gap-3">
                    {usbConnection.isLoading || hardwareConnection.isLoading ? (
                      <Loader2
                        className="animate-spin text-[#2f6f95]"
                        size={20}
                      />
                    ) : (
                      <WifiOff className="text-[#b64c40]" size={20} />
                    )}
                    <div>
                      <h2 className="font-semibold">
                        {usbConnection.isLoading || hardwareConnection.isLoading
                          ? "Checking USB scanner"
                          : !hardwareTransportReady
                            ? (usbConnection.data?.label ??
                              "USB Scanner Disconnected")
                            : "Hardware scanner unavailable"}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                        {usbConnection.isLoading || hardwareConnection.isLoading
                          ? "Checking the local USB connection and configured scanner service."
                          : !hardwareTransportReady
                            ? (usbConnection.data?.message ??
                              "Connect the ESP32-S3 using USB.")
                            : "The USB scanner is ready, but the configured ScanGate capture service is unavailable."}
                      </p>
                    </div>
                  </div>
                  {usbConnection.data?.testMode ? (
                    <div className="mt-4 border-t border-[#f1d4cf] pt-4">
                      <label
                        htmlFor="usb-test-state"
                        className="block text-xs font-semibold text-[#587181]"
                      >
                        Development USB test state
                      </label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <select
                          id="usb-test-state"
                          value={testUsbState}
                          onChange={event =>
                            setTestUsbState(
                              event.target.value as typeof testUsbState
                            )
                          }
                          className="h-10 flex-1 rounded-xl border border-[#c9e2ef] bg-white px-3 text-xs"
                        >
                          <option value="DISCONNECTED">Disconnected</option>
                          <option value="CONNECTING">Connecting</option>
                          <option value="CONNECTED">Connected</option>
                          <option value="READY">Ready</option>
                          <option value="ERROR">Connection error</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setTestUsbConnection.mutate({ state: testUsbState })
                          }
                          disabled={setTestUsbConnection.isPending}
                          className="press inline-flex items-center justify-center gap-2 rounded-xl border border-[#2f7898] px-4 py-2 text-xs font-semibold text-[#2f6f95] disabled:opacity-40"
                        >
                          {setTestUsbConnection.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          Apply test state
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!(usbConnection.isLoading || hardwareConnection.isLoading) ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => retryUsb.mutate()}
                        disabled={retryUsb.isPending}
                        className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      >
                        {retryUsb.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )} {" "}
                        Retry USB connection
                      </button>
                      <button
                        type="button"
                        onClick={() => void chooseSource("camera")}
                        className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-3 py-2 text-xs font-semibold text-white"
                      >
                        <Camera size={14} /> Use Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => void chooseSource("upload")}
                        className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-3 py-2 text-xs font-semibold"
                      >
                        <FileUp size={14} /> Use Upload
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {source === "hardware" &&
                  hardwareConnection.data &&
                  usbConnection.data ? (
                    <div
                      className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 ${hardwareConnection.data.available ? "border-[#b9dfc9] bg-[#f5fcf7]" : "border-[#f0d5a7] bg-[#fffaf0]"}`}
                    >
                      {hardwareConnection.data.available ? (
                        <CheckCircle2
                          className="mt-0.5 text-[#28734b]"
                          size={18}
                        />
                      ) : (
                        <RefreshCw
                          className="mt-0.5 text-[#9a6b22]"
                          size={18}
                        />
                      )}
                      <div>
                        <p
                          className={`text-sm font-semibold ${hardwareConnection.data.available ? "text-[#28734b]" : "text-[#855d20]"}`}
                        >
                          {hardwareConnection.data.available
                            ? "Hardware Camera Connected — Ready to Scan"
                            : "ESP32 camera connected — ScanGate reconnecting"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#587181]">
                          {usbConnection.data.message}{" "}
                          {hardwareConnection.data.available
                            ? usbConnection.data.testMode
                              ? hardwareConnection.data.message
                              : null
                            : "The real hardware preview remains available while the processing service is checked."}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
                      <QrCode size={21} />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">
                        {source === "hardware"
                          ? "Scan QR with hardware camera"
                          : source === "upload"
                            ? "Upload a QR image"
                            : "Scan QR code"}
                      </h2>
                      <p className="mt-1 text-sm text-[#6b8190]">
                        {source === "upload"
                          ? "Choose a QR screenshot, downloaded PNG, or clear photo."
                          : "Place the bundle QR inside the frame."}
                      </p>
                    </div>
                  </div>
                  {source === "camera" ? (
                    <div className="mt-5 rounded-2xl border border-[#d9eaf3] bg-[#163044]">
                      <div
                        className="relative mx-auto w-full border border-[#5f9abb]/70 bg-[#0b1d28]"
                        style={{
                          aspectRatio: `${cameraFrameDimensions.width} / ${cameraFrameDimensions.height}`,
                        }}
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          onLoadedMetadata={event => {
                            const target = event.currentTarget;
                            if (target.videoWidth && target.videoHeight) {
                              setCameraFrameDimensions({
                                width: target.videoWidth,
                                height: target.videoHeight,
                              });
                            }
                          }}
                          className={`absolute inset-0 h-full w-full object-contain object-center ${cameraMode === "qr" ? "" : "hidden"}`}
                        />
                        {cameraMode !== "qr" ? (
                          <div className="grid h-full place-items-center p-6 text-center text-white">
                            {qrStatus === "verified" ? (
                              <CheckCircle2 className="mx-auto text-[#9dd7b5]" size={30} />
                            ) : (
                              <CameraOff className="mx-auto text-[#8fc7e8]" size={28} />
                            )}
                            <p className="mt-3 text-sm">
                              {qrStatus === "verified"
                                ? "QR detected and verified"
                                : "QR camera is starting..."}
                            </p>
                          </div>
                        ) : null}
                        <span className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92%] -translate-x-1/2 truncate rounded-full bg-[#102737]/85 px-3 py-1 text-[10px] font-semibold text-white">
                          Full camera frame visible
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-3 text-xs text-white/75">
                        <span>{qrFeedback}</span>
                        {videoDevices.length > 1 ? (
                          <select
                            value={videoDeviceId}
                            onChange={event => {
                              setVideoDeviceId(event.target.value);
                              void startStream("qr");
                            }}
                            className="rounded-lg border border-white/20 bg-transparent px-2 py-1 text-xs text-white"
                          >
                            <option className="text-[#163044]" value="">Select camera</option>
                            {videoDevices.map(device => (
                              <option className="text-[#163044]" key={device.deviceId} value={device.deviceId}>
                                {device.label || "Camera"}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  ) : source === "hardware" ? (
                    <div className="mt-5">
                      <HardwareCameraPreview
                        image={hardwarePreview.image}
                        capturedAt={hardwarePreview.capturedAt}
                        source={hardwarePreview.source}
                        connected={Boolean(
                          usbConnection.data?.connected &&
                            !usbConnection.data.testMode
                        )}
                        loading={hardwarePreviewCapture.isPending}
                        status={
                          hardwarePreviewError ||
                          (qrStatus === "verified"
                            ? "QR detected and verified"
                            : qrFeedback)
                        }
                        onRefresh={refreshHardwarePreview}
                      />
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-[#6b8190]">
                          The preview is an actual periodic ESP32 USB frame. This firmware does not expose live video.
                        </p>
                        <button
                          type="button"
                          onClick={() => void scanHardwareQr()}
                          disabled={
                            hardwareQrScan.isPending ||
                            hardwarePreviewCapture.isPending ||
                            hardwareConnection.data?.testMode ||
                            !usbConnection.data?.ready
                          }
                          className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {hardwareQrScan.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <QrCode size={16} />
                          )}
                          {hardwareQrScan.isPending ? "Scanning QR..." : "Scan QR"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-dashed border-[#c9e2ef] bg-[#f8fcff] p-6 text-center">
                      {qrImagePreview ? (
                        <img
                          src={qrImagePreview}
                          alt="Uploaded QR preview"
                          className="mx-auto max-h-64 max-w-full rounded-xl border border-[#d9eaf3] bg-white object-contain"
                        />
                      ) : (
                        <UploadCloud className="mx-auto text-[#2f6f95]" size={30} />
                      )}
                      <p className="mt-3 text-sm font-semibold">
                        {qrImagePreview ? "QR image selected" : "Choose QR image"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#6b8190]">{qrFeedback}</p>
                      <button
                        type="button"
                        onClick={() => qrFileRef.current?.click()}
                        disabled={decodeQrImage.isPending}
                        className="press mt-5 inline-flex items-center gap-2 rounded-xl bg-[#163044] px-5 py-3 text-sm font-semibold text-white disabled:opacity-45"
                      >
                        {decodeQrImage.isPending ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                        {decodeQrImage.isPending ? "Scanning image..." : qrImagePreview ? "Choose another image" : "Upload QR image"}
                      </button>
                    </div>
                  )}
                  {cameraError && source === "camera" ? (
                    <div className="mt-3 rounded-xl border border-[#f1c8c3] bg-[#fff8f7] p-3 text-xs text-[#b64c40]">
                      {cameraError}
                    </div>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-[#d9eaf3] bg-[#f8fcff] p-4">
                    <p className="text-xs font-semibold text-[#587181]">
                      Using a hardware QR reader?
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={qrPayload}
                        onChange={event => setQrPayload(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter") verifyPayload(qrPayload);
                        }}
                        placeholder="Scan or paste QR payload"
                        className="h-11 flex-1 rounded-xl border border-[#c9e2ef] bg-white px-3 text-sm outline-none focus:border-[#75afd0]"
                      />
                      <button
                        type="button"
                        onClick={() => verifyPayload(qrPayload)}
                        disabled={!qrPayload.trim() || qrStatus === "verifying"}
                        className="press inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#163044] px-4 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        <QrCode size={15} /> Verify QR
                      </button>
                    </div>
                  </div>
                  {qrStatus === "not_detected" ? (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#efd9a8] bg-[#fffaf0] p-4">
                      <AlertTriangle className="mt-0.5 text-[#9b6a18]" size={18} />
                      <div>
                        <p className="font-semibold text-[#8a5d16]">QR not detected</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b8190]">{qrFeedback}</p>
                      </div>
                    </div>
                  ) : null}
                  {qrStatus === "invalid" ? (
                    <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${/expired/i.test(paperLookup.error?.message ?? "") ? "border-[#efd9a8] bg-[#fffaf0]" : "border-[#f1c8c3] bg-[#fff8f7]"}`}>
                      {/expired/i.test(paperLookup.error?.message ?? "") ? (
                        <AlertTriangle className="mt-0.5 text-[#9b6a18]" size={18} />
                      ) : (
                        <X className="mt-0.5 text-[#b64c40]" size={18} />
                      )}
                      <div>
                        <p className={`font-semibold ${/expired/i.test(paperLookup.error?.message ?? "") ? "text-[#8a5d16]" : "text-[#b64c40]"}`}>
                          {/expired/i.test(paperLookup.error?.message ?? "") ? "Expired QR" : "Invalid QR"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#6b8190]">
                          {paperLookup.error?.message ??
                            "Unknown, expired, revoked, or wrong-session QR."}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setQrRequest("");
                            setQrPayload("");
                            setQrStatus("scanning");
                            setQrFeedback("Scanning for QR...");
                            if (source === "camera") void startStream("qr");
                          }}
                          className="mt-3 text-xs font-semibold text-[#2f6f95]"
                        >
                          Scan again
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {paperLookup.data && qrStatus === "verified" ? (
                    <>
                      <DetailsCard lookup={paperLookup.data} />
                      <div className="mt-5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void continueAfterQr()}
                          className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white"
                        >
                          Continue to capture <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : step === 2 ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mono-label text-[#2f6f95]">Step 2 · Capture</p>
                  <h2 className="mt-2 text-lg font-semibold">
                    Capture the answer sheet
                  </h2>
                  <p className="mt-1 text-sm text-[#6b8190]">
                    Keep the full page inside the frame.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void resetToQr()}
                  className="press inline-flex items-center gap-2 text-xs font-semibold text-[#2f6f95]"
                >
                  <ArrowLeft size={14} /> Back to QR
                </button>
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  {source === "camera" ? (
                    <div className="rounded-2xl border border-[#d9eaf3] bg-[#163044]">
                      <div
                        className="relative mx-auto w-full border border-[#5f9abb]/70 bg-[#0b1d28]"
                        style={{
                          aspectRatio: `${cameraFrameDimensions.width} / ${cameraFrameDimensions.height}`,
                        }}
                      >
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          onLoadedMetadata={event => {
                            const target = event.currentTarget;
                            if (target.videoWidth && target.videoHeight) {
                              setCameraFrameDimensions({
                                width: target.videoWidth,
                                height: target.videoHeight,
                              });
                            }
                          }}
                          className="absolute inset-0 h-full w-full object-contain object-center"
                        />
                        <span className="pointer-events-none absolute bottom-2 left-1/2 max-w-[92%] -translate-x-1/2 truncate rounded-full bg-[#102737]/85 px-3 py-1 text-[10px] font-semibold text-white">
                          Full camera frame visible
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 p-3 text-xs text-white/75">
                        <span>
                          Full frame {cameraFrameDimensions.width} × {cameraFrameDimensions.height}
                        </span>
                        <button
                          type="button"
                          onClick={captureAnswerPhoto}
                          className="press inline-flex items-center gap-2 rounded-xl bg-[#8fc7e8] px-4 py-2.5 font-semibold text-[#163044]"
                        >
                          <Camera size={15} />
                          {retakePageId
                            ? "Retake selected page"
                            : pages.length
                              ? "Capture More"
                              : "Capture"}
                        </button>
                      </div>
                    </div>
                  ) : source === "upload" ? (
                    <div className="rounded-2xl border border-dashed border-[#c9e2ef] bg-[#f8fcff] p-8 text-center">
                      <UploadCloud
                        className="mx-auto text-[#2f6f95]"
                        size={28}
                      />
                      <h3 className="mt-3 font-semibold">
                        {retakePageId
                          ? "Replace the selected page"
                          : pages.length
                            ? "Add more answer-sheet pages"
                            : "Choose answer sheet pages"}
                      </h3>
                      <p className="mt-1 text-xs text-[#6b8190]">
                        Choose one PDF or select multiple JPG/PNG images.
                        Selected images become pages in order.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="press mt-5 inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white"
                      >
                        <FileUp size={16} />
                        {retakePageId
                          ? "Choose replacement"
                          : pages.length
                            ? "Add files"
                            : "Choose files"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <HardwareCameraPreview
                        image={
                          hardwareCapture.data?.accepted &&
                          hardwareCapture.data.enhancedPreview
                            ? hardwareCapture.data.enhancedPreview
                            : hardwarePreview.image
                        }
                        capturedAt={hardwarePreview.capturedAt}
                        source={
                          hardwareCapture.data?.accepted
                            ? "ScanGate enhanced capture"
                            : hardwarePreview.source
                        }
                        connected={Boolean(
                          usbConnection.data?.connected &&
                            !usbConnection.data.testMode
                        )}
                        loading={hardwarePreviewCapture.isPending}
                        status={
                          hardwarePreviewError ||
                          hardwareCapture.data?.message ||
                          (retakePageId
                            ? "Ready to retake the selected page"
                            : `Ready to capture page ${pages.length + 1}`)
                        }
                        onRefresh={refreshHardwarePreview}
                        resultImage={Boolean(
                          hardwareCapture.data?.accepted &&
                            hardwareCapture.data.enhancedPreview
                        )}
                      />
                      <div className="rounded-2xl border border-[#b9dfc9] bg-[#f5fcf7] p-6">
                      {!usbConnection.data?.connected &&
                      !hardwareSessionId &&
                      !hardwarePreviewCapture.isPending ? (
                        <div className="flex items-start gap-3">
                          {usbConnection.isLoading ? (
                            <Loader2
                              className="animate-spin text-[#2f6f95]"
                              size={20}
                            />
                          ) : (
                            <WifiOff className="text-[#b64c40]" size={20} />
                          )}
                          <div>
                            <h3 className="font-semibold">
                              {usbConnection.isLoading
                                ? "Checking USB scanner"
                                : (usbConnection.data?.label ??
                                  "USB Scanner Disconnected")}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                              {usbConnection.isLoading
                                ? "Checking the local USB scanner connection."
                                : (usbConnection.data?.message ??
                                  "Connect the ESP32-S3 using USB, then retry the connection.")}
                            </p>
                            <button
                              type="button"
                              onClick={() => retryUsb.mutate()}
                              disabled={retryUsb.isPending}
                              className="press mt-4 inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold disabled:opacity-40"
                            >
                              {retryUsb.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RefreshCw size={16} />
                              )} {" "}
                              Retry USB connection
                            </button>
                          </div>
                        </div>
                      ) : usbConnection.data?.ready &&
                        !hardwareConnection.data?.available &&
                        !hardwareSessionId &&
                        !hardwarePreviewCapture.isPending ? (
                        <div className="flex items-start gap-3">
                          <WifiOff className="text-[#b64c40]" size={20} />
                          <div>
                            <h3 className="font-semibold">
                              Hardware scanner unavailable
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                              Retry the connection, or use Camera or Upload
                              without interrupting this verified QR workflow.
                            </p>
                            <button
                              type="button"
                              onClick={() => void hardwareConnection.refetch()}
                              className="press mt-4 inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold"
                            >
                              <RefreshCw size={16} /> Retry connection
                            </button>
                          </div>
                        </div>
                      ) : !hardwareSessionId ? (
                        <div className="flex items-start gap-3">
                          <HardDrive className="text-[#28734b]" size={20} />
                          <div>
                            <h3 className="font-semibold">
                              QR verified · Paper ready
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                              Capture the answer sheet with the ESP32 camera.
                              ScanGate will run the existing quality and
                              enhancement pipeline before it can be stored.
                            </p>
                            <button
                              type="button"
                              onClick={beginHardwareCapture}
                              disabled={
                                armHardware.isPending ||
                                hardwarePreviewCapture.isPending ||
                                !usbConnection.data?.ready
                              }
                              className="press mt-4 inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                            >
                              {armHardware.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <ScanLine size={16} />
                              )}{" "}
                              {retakePageId
                                ? "Retake selected page"
                                : pages.length
                                  ? "Capture More"
                                  : "Capture Answer Sheet"}
                            </button>
                          </div>
                        </div>
                      ) : hardwareCapture.data?.accepted ? (
                        <div>
                          <div className="flex items-start gap-3">
                            <CheckCircle2
                              className="text-[#28734b]"
                              size={20}
                            />
                            <div>
                              <h3 className="font-semibold">Scan accepted</h3>
                              <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                                ScanGate accepted the page. Review the enhanced
                                image before storing the answer sheet.
                              </p>
                            </div>
                          </div>
                          <div className="mt-5 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={reviewHardwareCapture}
                              className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white"
                            >
                              <Check size={16} /> Add accepted page
                            </button>
                            <button
                              type="button"
                              onClick={retryHardwareCapture}
                              className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold"
                            >
                              <RotateCcw size={16} /> Retake
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start gap-3">
                            <ScanLine className="text-[#2f6f95]" size={20} />
                            <div>
                              <h3 className="font-semibold">
                                {hardwareCapture.data?.state ===
                                "RETAKE_REQUIRED"
                                  ? "Retake required"
                                  : hardwareCapture.data?.state === "ERROR" ||
                                      hardwareCapture.data?.state === "OFFLINE"
                                    ? hardwareCapture.data?.message ===
                                      "Answer-sheet capture timed out."
                                      ? "Answer-sheet capture timed out"
                                      : "Could not capture the answer sheet"
                                    : "Hardware capture in progress"}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-[#6b8190]">
                                {hardwareCapture.data?.message ??
                                  "The ESP32 camera is sending its two-frame burst to the existing ScanGate pipeline."}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void hardwareCapture.refetch()}
                              disabled={hardwareCapture.isFetching}
                              className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold disabled:opacity-40"
                            >
                              {hardwareCapture.isFetching ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RefreshCw size={16} />
                              )}{" "}
                              Check scanner
                            </button>
                            {hardwareCapture.data?.state ===
                              "RETAKE_REQUIRED" ||
                            hardwareCapture.data?.state === "ERROR" ||
                            hardwareCapture.data?.state === "OFFLINE" ? (
                              <button
                                type="button"
                                onClick={retryHardwareCapture}
                                className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white"
                              >
                                <RotateCcw size={16} />
                                {hardwareCapture.data?.state === "ERROR" ||
                                hardwareCapture.data?.state === "OFFLINE"
                                  ? "Retry capture"
                                  : "Capture again"}
                              </button>
                            ) : null}
                            {hardwareCapture.data?.state === "ERROR" ||
                            hardwareCapture.data?.state === "OFFLINE" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  retryHardwareCapture();
                                  retryUsb.mutate();
                                }}
                                disabled={retryUsb.isPending}
                                className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold disabled:opacity-40"
                              >
                                {retryUsb.isPending ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Usb size={16} />
                                )}
                                Reconnect USB
                              </button>
                            ) : null}
                          </div>
                          {hardwareConnection.data?.testMode ? (
                            <div className="mt-5 border-t border-[#cce4d6] pt-4">
                              <p className="text-xs font-semibold text-[#587181]">
                                Development test capture
                              </p>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <select
                                  value={testHardwareStatus}
                                  onChange={event =>
                                    setTestHardwareStatus(
                                      event.target
                                        .value as typeof testHardwareStatus
                                    )
                                  }
                                  className="h-10 flex-1 rounded-xl border border-[#c9e2ef] bg-white px-3 text-xs"
                                >
                                  <option value="OK">Accepted scan</option>
                                  <option value="BLUR">Blur</option>
                                  <option value="CHOP">Page crop</option>
                                  <option value="GLARE">Glare</option>
                                  <option value="SYSTEM_ERROR">
                                    Scanner error
                                  </option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    hardwareSessionId &&
                                    testHardwareCapture.mutate({
                                      sessionId: hardwareSessionId,
                                      status: testHardwareStatus,
                                    })
                                  }
                                  disabled={testHardwareCapture.isPending}
                                  className="press inline-flex items-center justify-center gap-2 rounded-xl border border-[#2f7898] px-4 py-2 text-xs font-semibold text-[#2f6f95] disabled:opacity-40"
                                >
                                  {testHardwareCapture.isPending ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <ScanLine size={14} />
                                  )}{" "}
                                  Run test capture
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                      </div>
                    </div>
                  )}
                  {cameraError && source === "camera" ? (
                    <div className="mt-3 rounded-xl border border-[#f1c8c3] bg-[#fff8f7] p-3 text-xs text-[#b64c40]">
                      {cameraError}
                      <button
                        type="button"
                        onClick={() => void startStream("answer")}
                        className="ml-2 font-semibold underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {source === "camera" && videoDevices.length > 1 ? (
                    <select
                      value={videoDeviceId}
                      onChange={event => {
                        setVideoDeviceId(event.target.value);
                        void startStream("answer");
                      }}
                      className="mt-3 h-10 w-full rounded-xl border border-[#d9eaf3] bg-white px-3 text-xs"
                    >
                      <option value="">Select camera</option>
                      {videoDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || "Camera"}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#c9e2ef] bg-[#f8fcff] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="mono-label text-[#2f6f95]">Capture session</p>
                        <p className="mt-1 text-sm font-semibold">
                          {paperLookup.data?.paper.bundleLabel ?? "Verified bundle"}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#eaf6fd] px-3 py-1.5 text-xs font-semibold text-[#2f6f95]">
                        Captured: {pages.length}
                      </span>
                    </div>
                    {pages.length ? (
                      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                        {pages.map(page => (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => setSelectedPageId(page.id)}
                            className={`shrink-0 rounded-xl border p-1.5 ${selectedPageId === page.id ? "border-[#2f7898] bg-[#eaf6fd]" : "border-[#d9eaf3] bg-white"}`}
                          >
                            <img
                              src={page.thumbnailDataUrl}
                              alt={`Page ${page.pageNumber} thumbnail`}
                              className="h-16 w-12 rounded-md bg-white object-cover"
                            />
                            <span className="mt-1 block text-[10px] font-semibold">
                              Page {page.pageNumber}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-[#6b8190]">
                        Each capture adds one page to this QR-bound session.
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-[#b9dfc9] bg-[#f5fcf7] p-5">
                    <div className="flex items-center gap-2">
                      <QrCode size={17} className="text-[#28734b]" />
                      <p className="text-sm font-semibold">
                        Paper details locked from QR
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#587181]">
                      The verified QR automatically supplies the subject, paper
                      code, session, set, and bundle. Candidate identity can be
                      enriched later without blocking storage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 3 ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mono-label text-[#2f6f95]">Step 3 · Review</p>
                  <h2 className="mt-2 text-lg font-semibold">Capture session</h2>
                  <p className="mt-1 text-sm text-[#6b8190]">
                    Review the current page, add more, or submit the complete booklet.
                  </p>
                </div>
                <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 text-xs font-semibold text-[#2f6f95]">
                  Captured: {pages.length}
                </span>
              </div>
              {pages.some(page => page.clarity !== "CLEAR") ? (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#f1c8c3] bg-[#fff8f7] p-4">
                  <AlertTriangle className="mt-0.5 text-[#b64c40]" size={18} />
                  <div>
                    <p className="font-semibold text-[#b64c40]">
                      Quality check failed
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#6b8190]">
                      Recapture or replace each flagged page before submitting.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-[#f8fcff]">
                  {selectedPage ? (
                    <img
                      src={selectedPage.pageDataUrl}
                      alt={`Answer sheet page ${selectedPage.pageNumber}`}
                      className="max-h-[680px] min-h-[320px] w-full bg-white object-contain"
                    />
                  ) : null}
                  {selectedPage ? (
                    <div className="border-t border-[#d9eaf3] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            Page {selectedPage.pageNumber} of session
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#6b8190]">
                            {selectedPage.reason}
                          </p>
                        </div>
                        <QualityBadge page={selectedPage} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void retakeSelectedPage()}
                          className="press inline-flex items-center gap-2 rounded-xl border border-[#c9e2ef] bg-white px-3 py-2.5 text-xs font-semibold"
                        >
                          <RotateCcw size={14} /> Retake page
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePage(selectedPage.id)}
                          className={`press inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${pendingDeletePageId === selectedPage.id ? "border-[#d96c60] bg-[#fff0ee] text-[#a43e34]" : "border-[#f1c8c3] bg-white text-[#b64c40]"}`}
                        >
                          <Trash2 size={14} />
                          {pendingDeletePageId === selectedPage.id
                            ? "Confirm delete"
                            : "Delete page"}
                        </button>
                        {pendingDeletePageId === selectedPage.id ? (
                          <button
                            type="button"
                            onClick={() => setPendingDeletePageId(null)}
                            className="press px-2 py-2.5 text-xs font-semibold text-[#6b8190]"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="min-w-0 rounded-2xl border border-[#d9eaf3] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="mono-label text-[#2f6f95]">Pages</p>
                      <p className="mt-1 text-sm font-semibold">
                        {paperLookup.data?.paper.bundleLabel ?? "Verified bundle"}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#28734b]">
                      {pages.filter(page => page.clarity === "CLEAR").length}/{pages.length} ready
                    </span>
                  </div>
                  <div className="mt-4 grid max-h-[620px] grid-cols-2 gap-3 overflow-y-auto pr-1 lg:grid-cols-1">
                    {pages.map(page => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => {
                          setSelectedPageId(page.id);
                          setPendingDeletePageId(null);
                        }}
                        className={`press flex min-w-0 items-center gap-3 rounded-xl border p-2 text-left ${selectedPage?.id === page.id ? "border-[#2f7898] bg-[#eaf6fd]" : "border-[#d9eaf3] bg-[#f8fcff]"}`}
                      >
                        <img
                          src={page.thumbnailDataUrl}
                          alt={`Page ${page.pageNumber} thumbnail`}
                          className="h-20 w-16 shrink-0 rounded-lg bg-white object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold">
                            Page {page.pageNumber}
                          </span>
                          <span className={`mt-1 block text-[10px] font-semibold uppercase ${page.clarity === "CLEAR" ? "text-[#28734b]" : "text-[#b64c40]"}`}>
                            {page.clarity === "CLEAR" ? "Ready" : "Retake"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {fileName ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#6b8190]">
                  <FileCheck2 size={15} className="text-[#2f7898]" />
                  {source === "camera"
                    ? `${pages.length} camera capture${pages.length === 1 ? "" : "s"} · capture session`
                    : source === "hardware"
                      ? `${pages.length} hardware capture${pages.length === 1 ? "" : "s"} · ScanGate session`
                      : fileMeta?.type === "image set"
                        ? `${pages.length} answer-sheet image${pages.length === 1 ? "" : "s"} · image set`
                        : `${fileName} · ${fileMeta ? `${(fileMeta.size / 1024 / 1024).toFixed(1)} MB · ${fileMeta.type}` : "ready"}`}
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4eef3] pt-5">
                <button
                  type="button"
                  onClick={() => void captureMore()}
                  className="press inline-flex items-center gap-2 rounded-xl border border-[#d9eaf3] px-4 py-3 text-sm font-semibold"
                >
                  <Plus size={16} />
                  {source === "upload" ? "Add More" : "Capture More"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitPages()}
                  disabled={submissionPending || Boolean(storeBlockers.length)}
                  className="press inline-flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submissionPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  Submit All ({pages.length})
                </button>
              </div>
              {storeBlockers.length ? (
                <p className="mt-3 text-right text-xs text-[#b64c40]">
                  {storeBlockers[0]}
                </p>
              ) : (
                <p className="mt-3 text-right text-xs text-[#28734b]">
                  QR verified and all captured pages are ready to submit.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e5f4ec] text-[#28734b]">
                <CheckCircle2 size={25} />
              </span>
              <p className="mono-label mt-4 text-[#28734b]">
                Ready for evaluation
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Answer sheet submitted
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b8190]">
                {pages.length} {pages.length === 1 ? "page is" : "pages are"}{" "}
                stored in the intake workflow and available to the admin and
                evaluator workspaces.
              </p>
              <p className="mt-4 font-mono text-xs text-[#7f9aaa]">
                {capturedBundleId ?? "Stored answer sheet"}
              </p>
              {submitted ? (
                <div className="mx-auto mt-5 max-w-md rounded-xl border border-[#b9dfc9] bg-[#f5fcf7] p-4 text-sm text-[#28734b]">
                  Backend confirmed: submitted for evaluation.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    capturedBundleId &&
                    submitCapture.mutate({ bundleId: capturedBundleId })
                  }
                  disabled={!capturedBundleId || submitCapture.isPending}
                  className="press mt-6 inline-flex items-center gap-2 rounded-xl bg-[#163044] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {submitCapture.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}{" "}
                  Submit answer sheet
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
