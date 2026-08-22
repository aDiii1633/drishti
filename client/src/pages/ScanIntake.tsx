import {
  asDataUrl,
  checkImageClarity,
  checkPdfClarity,
  type ClarityResult,
  type PdfPageEvidence,
} from "@/lib/pdf";
import { createFinalPdf } from "@/lib/finalPdf";
import { trpc } from "@/lib/trpc";
import { orderedEvidenceGallery } from "@/lib/evidenceGallery";
import type { SchemeQuestion } from "@shared/drishti";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  FileCheck2,
  FileUp,
  Loader2,
  Plus,
  QrCode,
  ScanLine,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Replacement = { result: ClarityResult; dataUrl: string; fileName: string };
type ExtractedScheme = {
  id: string;
  title: string;
  subject: string;
  maximumMarks: number;
  questions: SchemeQuestion[];
  printedMaximumMarks: number | null;
  questionCount: number;
};

function FileDrop({
  label,
  hint,
  file,
  onPick,
  accept = "application/pdf",
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (file: File) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mono-label text-[#6b8190]">{label}</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`press mt-2 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center ${file ? "border-[#c9e2ef] bg-[#eaf6fd]" : "border-[#c9e2ef] bg-[#f8fcff] hover:border-[#8fc7e8]"}`}
      >
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={event =>
            event.target.files?.[0] && onPick(event.target.files[0])
          }
        />
        {file ? (
          <>
            <FileCheck2 size={20} className="text-[#2f7898]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              {(file.size / 1024 / 1024).toFixed(1)} MB · ready
            </p>
          </>
        ) : (
          <>
            <UploadCloud size={20} className="text-[#2f6f95]" />
            <p className="mt-2 text-sm font-medium">Select PDF</p>
            <p className="mt-1 text-xs text-[#6b8190]">{hint}</p>
          </>
        )}
      </button>
    </div>
  );
}

// Question paper slot: unlike the plain FileDrop above, this one carries the automatic scheme
// extraction result (loading / success summary / failure) so the operator gets real feedback
// instead of a bare filename badge, mirroring the clarity gallery the booklet slot already shows.
function QuestionPaperDrop({
  file,
  onPick,
  extracting,
  result,
  failed,
}: {
  file: File | null;
  onPick: (file: File) => void;
  extracting: boolean;
  result: ExtractedScheme | null;
  failed: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const capturedTotal = result
    ? result.questions.reduce((sum, question) => sum + question.maximumMarks, 0)
    : 0;
  const mismatch = Boolean(
    result &&
      typeof result.printedMaximumMarks === "number" &&
      Math.abs(result.printedMaximumMarks - capturedTotal) > 0.5
  );
  return (
    <div>
      <p className="mono-label text-[#6b8190]">Question paper</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`press mt-2 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center ${file ? "border-[#c9e2ef] bg-[#eaf6fd]" : "border-[#c9e2ef] bg-[#f8fcff] hover:border-[#8fc7e8]"}`}
      >
        <input
          ref={ref}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={event =>
            event.target.files?.[0] && onPick(event.target.files[0])
          }
        />
        {!file ? (
          <>
            <UploadCloud size={20} className="text-[#2f6f95]" />
            <p className="mt-2 text-sm font-medium">Select PDF</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              PDF · questions and marks are read automatically
            </p>
          </>
        ) : extracting ? (
          <>
            <Loader2 size={20} className="animate-spin text-[#2f6f95]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              Reading questions and marks...
            </p>
          </>
        ) : result ? (
          <>
            <FileCheck2 size={20} className="text-[#2f7898]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              {result.questionCount} question
              {result.questionCount === 1 ? "" : "s"} · {result.maximumMarks}{" "}
              marks extracted
            </p>
          </>
        ) : (
          <>
            <FileCheck2 size={20} className="text-[#2f7898]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              {failed
                ? "Auto-extraction unavailable · pick a saved setup below or retry"
                : `${(file.size / 1024 / 1024).toFixed(1)} MB · ready`}
            </p>
          </>
        )}
      </button>
      {mismatch && (
        <div className="mt-2 flex gap-2 rounded-xl border border-[#eadcae] bg-[#fffbf0] p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#92610a]" />
          <p className="text-xs leading-5 text-[#2f6f95]">
            Printed paper total ({result!.printedMaximumMarks}) doesn't match
            the {capturedTotal}-mark scheme that was captured. Review the
            extracted questions in Teacher setup before proceeding.
          </p>
        </div>
      )}
    </div>
  );
}

export function CapturePanel({
  onCaptured,
  showSubmit = false,
}: {
  onCaptured: (id: string) => void;
  showSubmit?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [source, setSource] = useState<"camera" | "hardware" | "upload">("camera");
  const [candidateName, setCandidateName] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [candidateDob, setCandidateDob] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const [subject, setSubject] = useState("CBSE examination");
  const [qrPayload, setQrPayload] = useState("");
  const [hardwareStatus, setHardwareStatus] = useState("OFFLINE");
  const [capturedId, setCapturedId] = useState<string | null>(null);
  const [capturedPages, setCapturedPages] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const paperLookup = trpc.exam.resolveQr.useQuery(
    { payload: qrPayload || "pending" },
    { enabled: showSubmit && Boolean(qrPayload.trim()) }
  );
  const capture = trpc.bundles.captureImage.useMutation({
    onSuccess: result => {
      toast.success("Paper capture saved.");
      setCapturedId(result.id);
      setCapturedPages(1);
      onCaptured(result.id);
    },
    onError: error => toast.error(error.message),
  });
  const appendCapture = trpc.bundles.appendCapture.useMutation({
    onSuccess: result => {
      setCapturedPages(result.pageNumber);
      toast.success(`Page ${result.pageNumber} saved.`);
    },
    onError: error => toast.error(error.message),
  });
  const submitCapture = trpc.bundles.submitCapture.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Paper submitted for evaluation.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(
    () => () => streamRef.current?.getTracks().forEach(track => track.stop()),
    []
  );
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(
        "Camera access was denied or is unavailable on this device."
      );
    }
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };
  const submitFile = async (
    file: File,
    captureSource: "camera" | "hardware" | "pdf"
  ) => {
    if (!candidateName.trim() || !candidateId.trim() || !candidateDob)
      return toast.error("Enter the candidate name, ID, and date of birth first.");
    if (showSubmit && !paperLookup.data)
      return toast.error(
        "Scan a registered paper QR before capturing the answer sheet."
      );
    if (captureSource === "hardware") setHardwareStatus("CAPTURING");
    try {
      const clarity = await checkImageClarity(file, 1);
      if (clarity.clarity === "BLURRY") {
        toast.error(
          "Image quality is insufficient. Capture again with the page fully visible."
        );
        return;
      }
      const image = await asDataUrl(file);
      if (capturedId) {
        appendCapture.mutate({
          bundleId: capturedId,
          image,
          clarity: clarity.clarity,
          laplacianVariance: clarity.laplacianVariance,
          reason: clarity.reason,
        });
      } else {
        capture.mutate({
          candidateName,
          candidateId,
          candidateDob,
          subject: paperLookup.data?.paper.subject ?? subject,
          paperId: paperLookup.data?.paper.id,
          intakeQrToken: paperLookup.data?.token,
          source: captureSource,
          idempotencyKey: idempotencyKey.current,
          device:
            captureSource === "hardware"
              ? "scanner image input"
              : "browser camera",
          image,
          clarity: clarity.clarity,
          laplacianVariance: clarity.laplacianVariance,
          reason: clarity.reason,
        });
      }
    } catch {
      toast.error("The captured image could not be analyzed.");
    } finally {
      if (captureSource === "hardware") setHardwareStatus("READY");
    }
  };
  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth)
      return toast.error("Camera preview is not ready.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      blob => {
        if (blob)
          void submitFile(
            new File([blob], "camera-capture.jpg", { type: "image/jpeg" }),
            "camera"
          );
      },
      "image/jpeg",
      0.9
    );
  };
  return (
    <section className="panel mt-8 rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-label text-[#2f6f95]">
            {showSubmit ? "Scanner desk" : "Scan intake"}
          </p>
          <h2 className="mt-2 font-display text-3xl">Capture a paper image.</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[#6b8190]">
            Camera captures are processed in the browser and saved through the
            existing intake storage. Hardware stays truthful until a real
            scanner image is supplied.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#d9eaf3] bg-[#f8fcff] px-3 py-1.5 mono-label text-[#6b8190]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${hardwareStatus === "OFFLINE" ? "bg-[#b64c40]" : "bg-[#2f7898]"}`}
          />
          Hardware {hardwareStatus}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mono-label text-[#6b8190]">
            Candidate name
          </span>
          <input
            value={candidateName}
            onChange={event => setCandidateName(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
          />
        </label>
        <label>
          <span className="mono-label text-[#6b8190]">Candidate ID / roll number</span>
          <input required value={candidateId} onChange={event => setCandidateId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" />
        </label>
        <label>
          <span className="mono-label text-[#6b8190]">Date of birth</span>
          <input required type="date" value={candidateDob} onChange={event => setCandidateDob(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" />
        </label>
        {showSubmit ? (
          <div>
            <span className="mono-label text-[#6b8190]">Paper identity</span>
            <div className="mt-2 flex h-11 items-center rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-3 text-sm text-[#587181]">
              {paperLookup.data
                ? `${paperLookup.data.paper.subject} · ${paperLookup.data.paper.paperCode}`
                : "Scan the registered paper QR"}
            </div>
          </div>
        ) : (
          <label>
            <span className="mono-label text-[#6b8190]">Subject</span>
            <input
              value={subject}
              onChange={event => setSubject(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
            />
          </label>
        )}
      </div>
      {showSubmit ? (
        <div className="mt-5 rounded-2xl border border-[#c9e2ef] bg-[#eaf6fd] p-4">
          <div className="flex items-start gap-3">
            <QrCode size={18} className="mt-0.5 shrink-0 text-[#2f6f95]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Scan the paper QR first</p>
              <p className="mt-1 text-xs leading-5 text-[#587181]">
                A hardware scanner can type into this field. The resolved
                session, subject, paper, set, and marking setup lock this
                capture to the registered answer-sheet bundle.
              </p>
              <input
                value={qrPayload}
                onChange={event => setQrPayload(event.target.value)}
                placeholder="Scan or paste DRISHTI-INTAKE QR payload"
                className="mt-3 h-11 w-full rounded-xl border border-[#c9e2ef] bg-white px-3 text-sm outline-none focus:border-[#75afd0]"
              />
              {paperLookup.isFetching ? (
                <p className="mt-2 text-xs text-[#6b8190]">
                  Resolving paper QR...
                </p>
              ) : null}
              {paperLookup.isError ? (
                <p className="mt-2 text-xs text-[#b64c40]">
                  {paperLookup.error.message}
                </p>
              ) : null}
              {paperLookup.data ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-[#2f6f95]">
                    {paperLookup.data.paper.subject}
                  </span>
                  <span className="text-[#587181]">
                    {paperLookup.data.paper.subjectCode} ·{" "}
                    {paperLookup.data.paper.paperCode} ·{" "}
                    {paperLookup.data.session.code}
                  </span>
                  <span className="text-[#587181]">
                    Class {paperLookup.data.paper.className ?? "not set"} · Set{" "}
                    {paperLookup.data.paper.setNumber ?? "not set"}
                  </span>
                  <span className="text-[#587181]">
                    {paperLookup.data.paper.bundleLabel ?? "Paper bundle"} ·{" "}
                    {paperLookup.data.paper.expectedQuestionCount} questions
                  </span>
                  <span className="text-[#2f7898]">QR verified</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setSource("camera")}
          className={`press flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${source === "camera" ? "border-[#8fc7e8] bg-[#eaf6fd] text-[#2f6f95]" : "border-[#d9eaf3]"}`}
        >
          <Camera size={15} />
          Camera
        </button>
        <button
          type="button"
          onClick={() => setSource("hardware")}
          className={`press flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${source === "hardware" ? "border-[#8fc7e8] bg-[#eaf6fd] text-[#2f6f95]" : "border-[#d9eaf3]"}`}
        >
          <ScanLine size={15} />
          Hardware scanner
        </button>
        <button
          type="button"
          onClick={() => setSource("upload")}
          className={`press flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${source === "upload" ? "border-[#8fc7e8] bg-[#eaf6fd] text-[#2f6f95]" : "border-[#d9eaf3]"}`}
        >
          <FileUp size={15} /> Upload
        </button>
      </div>
      {source === "camera" ? (
        <div className="mt-4">
          {cameraOpen ? (
            <div className="overflow-hidden rounded-2xl border border-[#d9eaf3] bg-[#163044]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="aspect-video w-full object-cover"
              />
              <div className="flex gap-2 p-3">
                <button
                  type="button"
                  onClick={takePhoto}
                  disabled={capture.isPending}
                  className="press rounded-xl bg-[#8fc7e8] px-4 py-2 text-xs font-semibold text-[#163044]"
                >
                  Capture
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="press flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-xs font-semibold text-white"
                >
                  <CameraOff size={14} />
                  Close
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCamera}
              className="press flex items-center gap-2 rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-4 py-3 text-xs font-semibold"
            >
              <Camera size={16} />
              Open camera
            </button>
          )}
          {cameraError ? (
            <div className="mt-2 rounded-xl border border-[#fae2df] bg-[#fff8f7] p-3">
              <p className="text-xs text-[#b64c40]">{cameraError}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="text-xs font-semibold text-[#2f6f95]"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setSource("hardware")}
                  className="text-xs font-semibold text-[#2f6f95]"
                >
                  Use another method
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <label className="press mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#c9e2ef] bg-[#f8fcff] p-4">
          <UploadCloud size={18} className="text-[#2f6f95]" />
          <span>
            <span className="block text-sm font-semibold">
              {source === "upload" ? "Upload an answer-sheet image" : "Select a captured scanner image"}
            </span>
            <span className="mt-1 block text-xs text-[#6b8190]">
              The image is analyzed and saved only after a real file is
              provided.
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void submitFile(file, source === "upload" ? "pdf" : "hardware");
            }}
          />
        </label>
      )}
      {showSubmit && capturedId ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c9e2ef] bg-[#eaf6fd] p-4">
          <div>
            <p className="mono-label text-[#2f7898]">
              {submitted ? "SUBMITTED FOR EVALUATION" : "PAPER SAVED"}
            </p>
            <p className="mt-1 text-sm font-semibold">
              Capture {capturedId} · {capturedPages} page
              {capturedPages === 1 ? "" : "s"}{" "}
              {submitted
                ? "is ready for the next stage."
                : "passed the quality gate."}
            </p>
          </div>
          {submitted ? (
            <Check size={18} className="text-[#2f7898]" />
          ) : (
            <button
              type="button"
              disabled={submitCapture.isPending || appendCapture.isPending}
              onClick={() => submitCapture.mutate({ bundleId: capturedId })}
              className="press flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Check size={14} />
              SUBMIT FOR EVALUATION
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function ScanIntake() {
  const [candidateName, setCandidateName] = useState("");
  const [subject, setSubject] = useState("CBSE examination");
  const [paper, setPaper] = useState<File | null>(null);
  const [booklet, setBooklet] = useState<File | null>(null);
  const [pages, setPages] = useState<PdfPageEvidence[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<Record<number, Replacement>>(
    {}
  );
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [capturedBundleId, setCapturedBundleId] = useState<string | null>(null);
  const schemes = trpc.schemes.list.useQuery();
  const [schemeId, setSchemeId] = useState("");
  const utils = trpc.useUtils();
  const createBundle = trpc.bundles.create.useMutation({
    onSuccess: result => {
      setBundleId(result.id);
      toast.success(
        "Intake bundle stored. Replace flagged pages or finalize the record."
      );
    },
  });
  const replacePage = trpc.bundles.replacePage.useMutation();
  const finalize = trpc.bundles.finalize.useMutation({
    onSuccess: result => {
      setVerificationUrl(result.verificationUrl);
      toast.success(
        result.alreadyFinalized
          ? "This bundle was already finalized."
          : "Final.pdf stamped and stored.",
        { description: `Verification: ${result.verificationUrl}` }
      );
    },
  });
  const extractScheme = trpc.schemes.extractFromPdf.useMutation({
    onSuccess: async result => {
      setSchemeId(result.id);
      await utils.schemes.list.invalidate();
      toast.success(
        `${result.questionCount} question${result.questionCount === 1 ? "" : "s"} extracted · ${result.maximumMarks} marks captured.`
      );
    },
  });
  const pickPaper = async (file: File) => {
    setPaper(file);
    try {
      await extractScheme.mutateAsync({
        subject,
        title: candidateName ? undefined : file.name,
        questionPaper: { name: file.name, base64: await asDataUrl(file) },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not read questions and marks from this paper. Pick a saved setup below or retry."
      );
    }
  };
  const runClarity = async (file: File) => {
    setBooklet(file);
    setBusy(true);
    setPages([]);
    setProgress({ done: 0, total: 0 });
    try {
      const output = await checkPdfClarity(
        file,
        (done, total) => setProgress({ done, total }),
        evidence => setPages(current => [...current, evidence])
      );
      setPages(output);
      const blurry = output.filter(item => item.clarity === "BLURRY").length;
      toast[blurry ? "warning" : "success"](
        blurry
          ? `${blurry} page${blurry > 1 ? "s" : ""} need attention.`
          : `All ${output.length} pages passed the clarity gate.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to inspect this PDF."
      );
    } finally {
      setBusy(false);
    }
  };
  const saveIntake = async () => {
    if (!candidateName.trim() || !paper || !booklet || !pages.length)
      return toast.error(
        "Add the candidate, both PDFs, and run the clarity check first."
      );
    try {
      const created = await createBundle.mutateAsync({
        candidateName,
        subject,
        schemeId: schemeId || undefined,
        catalogTotal: 80,
        questionPaper: { name: paper.name, base64: await asDataUrl(paper) },
        booklet: { name: booklet.name, base64: await asDataUrl(booklet) },
        pages: pages.map(
          ({
            pageNumber,
            clarity,
            laplacianVariance,
            reason,
            pageDataUrl,
          }) => ({
            pageNumber,
            clarity,
            laplacianVariance,
            reason,
            pageDataUrl,
          })
        ),
      });
      const pending = Object.values(replacements);
      if (pending.length) {
        const stored = await Promise.allSettled(
          pending.map(replacement =>
            replacePage.mutateAsync({
              bundleId: created.id,
              page: { ...replacement.result, pageDataUrl: replacement.dataUrl },
            })
          )
        );
        const failed = stored.filter(item => item.status === "rejected").length;
        if (failed)
          toast.warning(
            `${failed} replacement page${failed === 1 ? "" : "s"} still need to be stored before finalizing.`
          );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not store this bundle."
      );
    }
  };
  const chooseReplacement = async (pageNumber: number, file: File) => {
    if (!["image/png", "image/jpeg"].includes(file.type))
      return toast.error("Replacement pages must be JPG or PNG images.");
    const dataUrl = await asDataUrl(file);
    const result = await checkImageClarity(file, pageNumber);
    setReplacements(current => ({
      ...current,
      [pageNumber]: { result, dataUrl, fileName: file.name },
    }));
    if (bundleId) {
      try {
        await replacePage.mutateAsync({
          bundleId,
          page: { ...result, pageDataUrl: dataUrl },
        });
        toast.success(`Page ${pageNumber} replacement stored.`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The replacement was analyzed but could not yet be stored."
        );
      }
    }
  };
  const finalizeBundle = async () => {
    if (!bundleId || !booklet)
      return toast.error("Store the intake bundle before finalizing it.");
    const unapproved = pages.filter(
      page =>
        page.clarity === "BLURRY" &&
        replacements[page.pageNumber]?.result.clarity !== "CLEAR"
    );
    if (unapproved.length)
      return toast.error(
        "Replace every BLURRY page with a CLEAR scan before creating final.pdf."
      );
    const token = crypto.randomUUID().replaceAll("-", "");
    try {
      const final = new File(
        [
          await createFinalPdf(
            booklet,
            Object.fromEntries(
              Object.entries(replacements).map(([page, value]) => [
                page,
                value.dataUrl,
              ])
            ),
            token
          ),
        ],
        "final.pdf",
        { type: "application/pdf" }
      );
      await finalize.mutateAsync({
        bundleId,
        qrToken: token,
        finalPdf: { name: final.name, base64: await asDataUrl(final) },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The final PDF could not be created."
      );
    }
  };
  const ready = Boolean(candidateName && paper && booklet && pages.length);
  return (
    <div className="teacher-readable mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mono-label text-[#2f6f95]">
            01 · Intake & clarity gate
          </p>
          <h1 className="mt-2 font-display text-5xl">
            Upload and check the booklet.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
            Add the question paper and answer booklet. Drishti checks every
            answer page and clearly flags any scan that needs replacing.
          </p>
        </div>
        <div className="rounded-full border border-[#d9eaf3] bg-white px-4 py-2">
          <span className="mono-label text-[#6b8190]">
            {progress.total
              ? `Batch ${progress.done}/${progress.total}`
              : "Awaiting booklet"}
          </span>
        </div>
      </div>
      <CapturePanel onCaptured={setCapturedBundleId} />
      {capturedBundleId ? (
        <div className="panel mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#c9e2ef] bg-[#eaf6fd] p-5">
          <div>
            <p className="mono-label text-[#2f7898]">PAPER RECEIVED</p>
            <p className="mt-2 text-sm font-semibold">
              Capture saved as {capturedBundleId}
            </p>
            <p className="mt-1 text-xs text-[#587181]">
              The image is stored and ready for the existing checking workspace.
            </p>
          </div>
          <a
            href={`/dashboard/marking?bundle=${capturedBundleId}`}
            className="press rounded-xl bg-[#163044] px-4 py-2.5 text-xs font-semibold text-white"
          >
            START CHECKING
          </a>
        </div>
      ) : null}
      <div className="mt-8 grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
              <FileUp size={18} />
            </span>
            <div>
              <h2 className="font-semibold">Bundle details</h2>
              <p className="text-xs text-[#6b8190]">
                Source documents are retained as discrete artifacts.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            <label>
              <span className="mono-label text-[#6b8190]">
                Candidate record
              </span>
              <input
                value={candidateName}
                onChange={event => setCandidateName(event.target.value)}
                placeholder="Candidate name or anonymised ID"
                className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-3 text-sm outline-none focus:border-[#8fc7e8]"
              />
            </label>
            <label>
              <span className="mono-label text-[#6b8190]">Subject</span>
              <input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-3 text-sm outline-none focus:border-[#8fc7e8]"
              />
            </label>
            <label>
              <span className="mono-label text-[#6b8190]">
                Question and marks setup
              </span>
              <select
                value={schemeId}
                onChange={event => setSchemeId(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-3 text-sm outline-none focus:border-[#8fc7e8]"
              >
                <option value="">
                  Attach later (AI evaluation unavailable)
                </option>
                {schemes.data?.map(scheme => (
                  <option key={scheme.id} value={scheme.id}>
                    {scheme.title} · {scheme.maximumMarks} marks
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[#6b8190]">
                Filled automatically once the question paper below is read, or
                choose a setup saved from Teacher setup.
              </p>
            </label>
            <QuestionPaperDrop
              file={paper}
              onPick={pickPaper}
              extracting={extractScheme.isPending}
              result={extractScheme.data ?? null}
              failed={extractScheme.isError}
            />
            <FileDrop
              label="Answer booklet"
              hint="PDF · every page will be analyzed"
              file={booklet}
              onPick={runClarity}
            />
          </div>
          <button
            type="button"
            disabled={!ready || createBundle.isPending || Boolean(bundleId)}
            onClick={saveIntake}
            className="press mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {createBundle.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ScanLine size={16} />
            )}
            Store intake bundle
          </button>
        </section>
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="mono-label text-[#2f6f95]">Clarity inspection</p>
              <h2 className="mt-2 font-display text-3xl">
                Every page, visibly checked.
              </h2>
            </div>
            {busy && <Loader2 className="animate-spin text-[#2f6f95]" />}
          </div>
          {!pages.length ? (
            <div className="mt-6 grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#ded8cf] bg-[#f8fcff] p-6 text-center">
              <div>
                <Sparkles className="mx-auto text-[#75afd0]" />
                <p className="mt-4 text-sm font-medium">No page readings yet</p>
                <p className="mt-2 max-w-xs text-xs leading-5 text-[#6b8190]">
                  Choose an answer-booklet PDF to render each page, show its
                  preview, and compute edge variance.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid max-h-[680px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {orderedEvidenceGallery(pages).map(card => {
                const page = pages.find(
                  item => item.pageNumber === card.pageNumber
                )!;
                const replacement = replacements[page.pageNumber];
                const actual = replacement?.result ?? page;
                return (
                  <div
                    key={page.pageNumber}
                    className="overflow-hidden rounded-2xl border border-[#d9eaf3] bg-[#f8fcff]"
                  >
                    <img
                      src={replacement?.dataUrl ?? card.previewUrl}
                      alt={`Rendered booklet page ${page.pageNumber}`}
                      className="h-44 w-full bg-[#f3f1ec] object-contain"
                    />
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#6b8190]">
                          PAGE {String(page.pageNumber).padStart(2, "0")}
                        </span>
                        <span
                          className={`ml-auto rounded-full px-2 py-1 mono-label ${actual.clarity === "CLEAR" ? "bg-[#e5f4fc] text-[#2f7898]" : "bg-[#fae2df] text-[#b64c40]"}`}
                        >
                          {actual.clarity}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[#6b8190]">
                        Variance {actual.laplacianVariance} · {actual.reason}
                      </p>
                      {page.clarity === "BLURRY" && (
                        <label className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#d9eaf3] bg-white px-3 py-1.5 text-xs font-medium">
                          <Plus size={14} />
                          Replace page
                          <input
                            className="hidden"
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={event =>
                              event.target.files?.[0] &&
                              chooseReplacement(
                                page.pageNumber,
                                event.target.files?.[0]
                              )
                            }
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-6 rounded-2xl border border-[#eadcae] bg-[#fffbf0] p-4">
            <div className="flex gap-3">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-[#92610a]"
              />
              <p className="text-xs leading-5 text-[#2f6f95]">
                A <strong>BLURRY</strong> label is never hidden. Every flagged
                page must be replaced with a CLEAR scan before the QR-stamped
                final.pdf is produced.
              </p>
            </div>
            <p className="mt-3 border-t border-[#eadcae] pt-3 text-xs leading-5 text-[#2f6f95]">
              <strong>Calibration note.</strong> This is a deterministic
              variance-of-Laplacian gate, not a proprietary vision model trained
              on your uploads. Before changing the threshold, validate it
              against a labelled set of at least 50 representative CLEAR and
              BLURRY scans and review false labels with an administrator.
            </p>
          </div>
          {bundleId && (
            <button
              type="button"
              disabled={finalize.isPending || Boolean(verificationUrl)}
              onClick={finalizeBundle}
              className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f6f95] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {finalize.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : verificationUrl ? (
                <Check size={16} />
              ) : (
                <QrCode size={16} />
              )}
              {verificationUrl
                ? "Bundle finalized"
                : "Create final.pdf & verification token"}
            </button>
          )}
          {verificationUrl && (
            <a
              href={verificationUrl}
              className="press mt-3 flex w-full items-center justify-center rounded-xl border border-[#d9c68f] bg-[#fffbf0] px-4 py-3 text-sm font-semibold text-[#2f6f95]"
            >
              Open verification record
            </a>
          )}
        </section>
      </div>
    </div>
  );
}
