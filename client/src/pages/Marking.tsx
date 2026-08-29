import {
  AlertCircle,
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  ExternalLink,
  FileText,
  Flag,
  Hand,
  Highlighter,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  Redo2,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import type { SchemeQuestion } from "@shared/drishti";
import { trpc } from "@/lib/trpc";
import { renderStoredPdfPage } from "@/lib/pdf";

type AnnotationKind =
  | "check"
  | "cross"
  | "circle"
  | "underline"
  | "highlight"
  | "comment"
  | "review"
  | "mark";

type AnnotationTool = AnnotationKind | "eraser" | "pan";

type AnnotationRecord = {
  id: string;
  bundleId: string;
  questionId: string;
  pageNumber: number;
  type: AnnotationKind;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string | null;
  style: {
    color?: string;
    source?: "ai" | "teacher";
    kind?: "grade-decision";
    marks?: number;
    maximumMarks?: number;
    evaluationId?: string;
  } | null;
};

type AnnotationDraft = Omit<
  AnnotationRecord,
  "id" | "bundleId" | "questionId" | "pageNumber"
>;

function safeWorkspaceError(error: { message?: unknown }, fallback: string) {
  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (
    !message ||
    /\b(sql|sqlite|select|insert|update|delete|constraint|stack|database)\b/i.test(
      message
    )
  )
    return fallback;
  return message;
}

function PdfEvidence({
  sourceUrl,
  fallbackUrl,
  page,
  zoom,
  rotation,
  compact = false,
  annotations,
  annotationTool,
  markValue,
  markMaximum,
  toolbar,
  onCreateAnnotation,
  onDeleteAnnotation,
  onEditScoreMark,
}: {
  sourceUrl: string | null | undefined;
  fallbackUrl: string | null | undefined;
  page: number;
  zoom: number;
  rotation: number;
  compact?: boolean;
  annotations: AnnotationRecord[];
  annotationTool: AnnotationTool;
  markValue: number;
  markMaximum: number;
  toolbar?: ReactNode;
  onCreateAnnotation: (annotation: AnnotationDraft) => void;
  onDeleteAnnotation: (annotation: AnnotationRecord) => void;
  onEditScoreMark: (annotation: AnnotationRecord) => void;
}) {
  const [src, setSrc] = useState<string | null>(fallbackUrl ?? null);
  const [loading, setLoading] = useState(Boolean(sourceUrl && !fallbackUrl));
  const [usingStoredEvidence, setUsingStoredEvidence] = useState(
    Boolean(fallbackUrl)
  );
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [shapeEnd, setShapeEnd] = useState<{ x: number; y: number } | null>(
    null
  );
  const [commentPoint, setCommentPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [commentText, setCommentText] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    // Ingestion stores one verified image per page. Prefer it for every scan,
    // including image uploads, so the workspace never asks PDF.js to parse a
    // non-PDF source artifact.
    if (fallbackUrl) {
      setSrc(fallbackUrl);
      setUsingStoredEvidence(true);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setUsingStoredEvidence(false);
    setLoading(Boolean(sourceUrl));
    setSrc(null);
    if (!sourceUrl)
      return () => {
        active = false;
      };
    renderStoredPdfPage(sourceUrl, page)
      .then(value => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (!active) return;
        setSrc(fallbackUrl ?? null);
        setUsingStoredEvidence(Boolean(fallbackUrl));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fallbackUrl, page, sourceUrl]);

  useEffect(() => {
    if (annotationTool !== "comment") {
      setCommentPoint(null);
      setCommentText("");
    }
  }, [annotationTool]);

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );
    const y = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top) / rect.height)
    );
    switch (rotation) {
      case 90:
        return { x: y, y: 1 - x };
      case 180:
        return { x: 1 - x, y: 1 - y };
      case 270:
        return { x: 1 - y, y: x };
      default:
        return { x, y };
    }
  };

  const finishShape = (end: { x: number; y: number }) => {
    if (!shapeStart) return;
    const x = Math.min(shapeStart.x, end.x);
    const y = Math.min(shapeStart.y, end.y);
    const width = Math.abs(end.x - shapeStart.x);
    const height = Math.abs(end.y - shapeStart.y);
    if (width > 0.008 || height > 0.008) {
      onCreateAnnotation({
        type: annotationTool as Extract<
          AnnotationTool,
          "circle" | "underline" | "highlight"
        >,
        x,
        y: annotationTool === "underline" ? (shapeStart.y + end.y) / 2 : y,
        width: Math.max(width, 0.012),
        height: annotationTool === "underline" ? 0 : Math.max(height, 0.012),
        content: null,
        style: null,
      });
    }
    setShapeStart(null);
    setShapeEnd(null);
  };

  const annotationContainsPoint = (
    annotation: AnnotationRecord,
    point: { x: number; y: number }
  ) => {
    const padding = 0.018;
    if (
      ["check", "cross", "comment", "review", "mark"].includes(annotation.type)
    )
      return (
        Math.abs(point.x - annotation.x) <= 0.045 &&
        Math.abs(point.y - annotation.y) <= 0.045
      );
    if (annotation.type === "underline")
      return (
        point.x >= annotation.x - padding &&
        point.x <= annotation.x + annotation.width + padding &&
        Math.abs(point.y - annotation.y) <= padding
      );
    return (
      point.x >= annotation.x - padding &&
      point.x <= annotation.x + annotation.width + padding &&
      point.y >= annotation.y - padding &&
      point.y <= annotation.y + annotation.height + padding
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (!point) return;
    if (annotationTool === "pan") {
      const viewport = canvasRef.current?.closest<HTMLElement>(
        "[data-answer-viewport]"
      );
      if (!viewport) return;
      panState.current = {
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (annotationTool === "eraser") {
      const annotation = [...annotations]
        .reverse()
        .find(
          item =>
            item.style?.source !== "ai" && annotationContainsPoint(item, point)
        );
      if (annotation) onDeleteAnnotation(annotation);
      return;
    }
    if (["circle", "underline", "highlight"].includes(annotationTool)) {
      setShapeStart(point);
      setShapeEnd(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (annotationTool === "comment") {
      setCommentPoint(point);
      setCommentText("");
      return;
    }
    if (annotationTool === "mark") {
      onCreateAnnotation({
        type: "mark",
        x: point.x,
        y: point.y,
        width: 0.16,
        height: 0.052,
        content: `Teacher awarded: ${markValue} / ${markMaximum}`,
        style: {
          color: "#28734b",
          source: "teacher",
          marks: markValue,
          maximumMarks: markMaximum,
        },
      });
      return;
    }
    if (
      annotationTool === "check" ||
      annotationTool === "cross" ||
      annotationTool === "review"
    ) {
      onCreateAnnotation({
        type: annotationTool,
        x: point.x,
        y: point.y,
        width: 0.04,
        height: 0.04,
        content: annotationTool === "review" ? "Review required" : null,
        style: null,
      });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (annotationTool === "pan" && panState.current) {
      const viewport = canvasRef.current?.closest<HTMLElement>(
        "[data-answer-viewport]"
      );
      if (viewport) {
        viewport.scrollLeft =
          panState.current.left - (event.clientX - panState.current.x);
        viewport.scrollTop =
          panState.current.top - (event.clientY - panState.current.y);
      }
      return;
    }
    if (!shapeStart) return;
    const point = pointFromEvent(event);
    if (point) setShapeEnd(point);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (annotationTool === "pan") {
      panState.current = null;
      return;
    }
    if (!shapeStart) return;
    const point = pointFromEvent(event);
    if (point) finishShape(point);
  };

  if (loading && !src)
    return (
      <div className="grid min-h-full place-items-center bg-[#efede8]">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-[#2f6f95]" size={22} />
          <p className="mt-3 text-xs font-medium text-[#6b8190]">
            Rendering full-resolution PDF page…
          </p>
        </div>
      </div>
    );

  if (!src)
    return (
      <div className="grid min-h-full place-items-center bg-[#efede8] px-8 text-center">
        <div>
          <AlertCircle className="mx-auto text-[#b45309]" size={24} />
          <p className="mt-3 text-sm font-semibold">
            Booklet evidence is unavailable.
          </p>
          <p className="mt-1 text-xs leading-5 text-[#6b8190]">
            Restore the stored answer-booklet PDF or re-upload this bundle.
          </p>
        </div>
      </div>
    );

  return (
    <div className="relative min-h-full min-w-full">
      {toolbar ? (
        <div className="absolute left-2 top-2 z-30">{toolbar}</div>
      ) : null}
      {usingStoredEvidence ? (
        <span className="absolute right-2 top-2 z-10 rounded border border-[#d9eaf3] bg-white/90 px-1.5 py-1 font-mono text-[9px] text-[#6b8190]">
          Stored evidence
        </span>
      ) : null}
      <div
        className={`flex min-h-full min-w-full items-start justify-center ${compact ? "p-2" : "p-4 sm:p-6"}`}
      >
        <div
          ref={canvasRef}
          style={{ width: `${zoom}%` }}
          className="relative block shrink-0 max-w-none select-none"
        >
          <div
            style={{
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
            }}
            className="relative origin-center transition-transform duration-200 ease-out"
          >
            <img
              src={src}
              alt={`Rendered answer booklet page ${page}`}
              draggable={false}
              className="block h-auto w-full max-w-none rounded-md bg-white shadow-[0_18px_55px_-28px_rgba(28,25,23,.45)]"
            />
            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-label="Teacher annotation layer"
              className={`absolute inset-0 h-full w-full ${annotationTool === "pan" ? "cursor-grab" : annotationTool === "eraser" ? "cursor-cell" : "cursor-crosshair"}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {annotations.map(annotation => {
                const activeEraser = annotationTool === "eraser";
                const editableScoreMark =
                  annotation.type === "mark" &&
                  annotation.style?.source === "teacher";
                const handleAnnotationPointerDown = (
                  event: ReactPointerEvent<SVGGElement>
                ) => {
                  if (activeEraser && annotation.style?.source !== "ai") {
                    event.stopPropagation();
                    onDeleteAnnotation(annotation);
                    return;
                  }
                  if (!editableScoreMark) return;
                  event.stopPropagation();
                  onEditScoreMark(annotation);
                };
                const shared = {
                  onPointerDown: handleAnnotationPointerDown,
                  style: {
                    pointerEvents:
                      activeEraser || editableScoreMark
                        ? ("all" as const)
                        : ("none" as const),
                  },
                };
                const color = annotation.style?.color ?? "#b64c40";
                if (annotation.type === "check")
                  return (
                    <g key={annotation.id} {...shared}>
                      <path
                        d={`M ${annotation.x} ${annotation.y + 0.018} l .012 .014 l .026 -.035`}
                        fill="none"
                        stroke="#16805c"
                        strokeWidth=".006"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                if (annotation.type === "cross")
                  return (
                    <g key={annotation.id} {...shared}>
                      <path
                        d={`M ${annotation.x} ${annotation.y} l .034 .034 M ${annotation.x + 0.034} ${annotation.y} l -.034 .034`}
                        fill="none"
                        stroke={color}
                        strokeWidth=".006"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                if (annotation.type === "circle")
                  return (
                    <g key={annotation.id} {...shared}>
                      <ellipse
                        cx={annotation.x + annotation.width / 2}
                        cy={annotation.y + annotation.height / 2}
                        rx={annotation.width / 2}
                        ry={annotation.height / 2}
                        fill="none"
                        stroke={color}
                        strokeWidth=".004"
                      />
                    </g>
                  );
                if (annotation.type === "underline")
                  return (
                    <g key={annotation.id} {...shared}>
                      <line
                        x1={annotation.x}
                        x2={annotation.x + annotation.width}
                        y1={annotation.y}
                        y2={annotation.y}
                        stroke={color}
                        strokeWidth=".005"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                if (annotation.type === "highlight")
                  return (
                    <g key={annotation.id} {...shared}>
                      <rect
                        x={annotation.x}
                        y={annotation.y}
                        width={annotation.width}
                        height={annotation.height}
                        fill="#f4cb48"
                        fillOpacity=".34"
                      />
                    </g>
                  );
                if (annotation.type === "mark") {
                  const value = annotation.style?.marks;
                  const maximum = annotation.style?.maximumMarks;
                  const label =
                    value !== undefined && maximum !== undefined
                      ? annotation.style?.source === "ai"
                        ? `AI +${value} / ${maximum}`
                        : `+${value} / ${maximum}`
                      : (annotation.content ?? "Mark");
                  return (
                    <g key={annotation.id} {...shared}>
                      <title>{annotation.content ?? "Mark annotation"}</title>
                      <rect
                        x={annotation.x}
                        y={annotation.y}
                        width={annotation.width || 0.16}
                        height={annotation.height || 0.052}
                        rx=".008"
                        fill={
                          annotation.style?.source === "ai"
                            ? "#eaf6fd"
                            : "#e5f4ec"
                        }
                        stroke={color}
                        strokeWidth=".0025"
                      />
                      <text
                        x={annotation.x + 0.009}
                        y={annotation.y + 0.033}
                        fill={color}
                        fontSize=".027"
                        fontWeight="700"
                      >
                        {label}
                      </text>
                    </g>
                  );
                }
                if (annotation.type === "comment")
                  return (
                    <g key={annotation.id} {...shared}>
                      <title>{annotation.content ?? "Teacher comment"}</title>
                      <circle
                        cx={annotation.x}
                        cy={annotation.y}
                        r=".015"
                        fill="#2f6f95"
                      />
                      <path
                        d={`M ${annotation.x - 0.006} ${annotation.y - 0.004} h .012 M ${annotation.x - 0.006} ${annotation.y + 0.003} h .008`}
                        stroke="white"
                        strokeWidth=".003"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                return (
                  <g key={annotation.id} {...shared}>
                    <title>{annotation.content ?? "Review required"}</title>
                    <path
                      d={`M ${annotation.x} ${annotation.y + 0.034} V ${annotation.y} h .027 l -.006 .009 l .006 .009 h -.027`}
                      fill="#b45309"
                      fillOpacity=".9"
                      stroke="#8c4400"
                      strokeWidth=".002"
                    />
                  </g>
                );
              })}
              {shapeStart && shapeEnd ? (
                annotationTool === "circle" ? (
                  <ellipse
                    cx={(shapeStart.x + shapeEnd.x) / 2}
                    cy={(shapeStart.y + shapeEnd.y) / 2}
                    rx={Math.abs(shapeEnd.x - shapeStart.x) / 2}
                    ry={Math.abs(shapeEnd.y - shapeStart.y) / 2}
                    fill="none"
                    stroke="#2f6f95"
                    strokeWidth=".004"
                    strokeDasharray=".01 .008"
                  />
                ) : annotationTool === "underline" ? (
                  <line
                    x1={shapeStart.x}
                    x2={shapeEnd.x}
                    y1={(shapeStart.y + shapeEnd.y) / 2}
                    y2={(shapeStart.y + shapeEnd.y) / 2}
                    stroke="#2f6f95"
                    strokeWidth=".005"
                  />
                ) : (
                  <rect
                    x={Math.min(shapeStart.x, shapeEnd.x)}
                    y={Math.min(shapeStart.y, shapeEnd.y)}
                    width={Math.abs(shapeEnd.x - shapeStart.x)}
                    height={Math.abs(shapeEnd.y - shapeStart.y)}
                    fill="#f4cb48"
                    fillOpacity=".26"
                  />
                )
              ) : null}
            </svg>
            {commentPoint ? (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  if (!commentText.trim()) return;
                  onCreateAnnotation({
                    type: "comment",
                    x: commentPoint.x,
                    y: commentPoint.y,
                    width: 0,
                    height: 0,
                    content: commentText.trim(),
                    style: null,
                  });
                  setCommentPoint(null);
                  setCommentText("");
                }}
                style={{
                  left: `${commentPoint.x * 100}%`,
                  top: `${commentPoint.y * 100}%`,
                }}
                className="absolute z-20 w-48 -translate-y-full rounded-lg border border-[#b6d6e8] bg-white p-2 shadow-lg"
              >
                <input
                  autoFocus
                  value={commentText}
                  onChange={event => setCommentText(event.target.value)}
                  placeholder="Add comment"
                  className="h-8 w-full rounded border border-[#d9eaf3] px-2 text-xs outline-none focus:border-[#2f6f95]"
                />
                <div className="mt-2 flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setCommentPoint(null)}
                    className="rounded px-2 py-1 text-[10px] text-[#6b8190]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded bg-[#163044] px-2 py-1 text-[10px] font-semibold text-white"
                  >
                    Add
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${accent ? "border-[#eadcae] bg-[#f8f2e5]" : "border-[#d9eaf3] bg-white"}`}
    >
      <p
        className={`mono-label ${accent ? "text-[#2f6f95]" : "text-[#7f9aaa]"}`}
      >
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-semibold tabular-nums">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[11px] text-[#6b8190]">{detail}</p>
      ) : null}
    </div>
  );
}

export default function Marking() {
  const [, checkingRouteParams] = useRoute("/evaluator/checking/:bundleId");
  const [, legacyRouteParams] = useRoute("/evaluator/paper/:bundleId");
  const [, setLocation] = useLocation();
  const isCheckingWorkspace = Boolean(checkingRouteParams?.bundleId);
  const initialBundle =
    checkingRouteParams?.bundleId ??
    legacyRouteParams?.bundleId ??
    new URLSearchParams(window.location.search).get("bundle") ??
    "";
  const [bundleId, setBundleId] = useState(initialBundle);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>(
    {}
  );
  const [humanMark, setHumanMark] = useState<number | "">("");
  const [markDrafts, setMarkDrafts] = useState<Record<string, number | "">>({});
  const [dirtyMarks, setDirtyMarks] = useState<Record<string, true>>({});
  const [markAnnotationPosition, setMarkAnnotationPosition] = useState<{
    pageNumber: number;
    x: number;
    y: number;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [teacherComment, setTeacherComment] = useState("");
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pan");
  const [annotationUndoStack, setAnnotationUndoStack] = useState<
    Array<{ action: "create" | "delete"; annotation: AnnotationRecord }>
  >([]);
  const [annotationRedoStack, setAnnotationRedoStack] = useState<
    Array<{ action: "create" | "delete"; annotation: AnnotationRecord }>
  >([]);
  const openedWorkspaces = useRef(new Set<string>());
  const [visitedPages, setVisitedPages] = useState<Record<string, number[]>>(
    {}
  );
  const bundles = trpc.bundles.list.useQuery();
  const detail = trpc.bundles.get.useQuery(
    { id: bundleId },
    {
      enabled: Boolean(bundleId),
      refetchInterval: isCheckingWorkspace ? 3_000 : false,
    }
  );
  const save = trpc.marking.save.useMutation({
    onSuccess: result => {
      toast.success(`Teacher mark saved at ${result.humanMarks ?? 0} marks.`);
      detail.refetch();
    },
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "Could not save this decision. Please try again."
        )
      ),
  });
  const openChecking = trpc.marking.open.useMutation({
    onSuccess: () => void detail.refetch(),
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "Could not open this evaluation workspace. Please try again."
        )
      ),
  });
  const aiQuestion = trpc.marking.aiGradeQuestion.useMutation({
    onSuccess: result => {
      toast.success(
        result.cached
          ? "Existing AI evaluation loaded."
          : `AI evaluation ready from ${result.model}.`
      );
      detail.refetch();
    },
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "AI evaluation could not be completed. Retry or continue with manual grading."
        )
      ),
  });
  const extractScheme = trpc.bundles.extractScheme.useMutation({
    onSuccess: () => {
      toast.success("Questions and marks read from the stored paper.");
      detail.refetch();
    },
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "Could not read the question setup. Please try again."
        )
      ),
  });
  const submit = trpc.marking.submit.useMutation({
    onSuccess: result => {
      toast.success(
        result.alreadyFinalized
          ? "Paper already finalized."
          : `Paper finalized at ${result.finalScore} / ${result.maximumMarks}.`
      );
      detail.refetch();
    },
    onError: error =>
      toast.error(safeWorkspaceError(error, "Paper cannot be finalized yet.")),
  });
  const annotationCreate = trpc.annotations.create.useMutation({
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "Could not save this annotation. Please try again."
        )
      ),
  });
  const annotationDelete = trpc.annotations.delete.useMutation({
    onError: error =>
      toast.error(
        safeWorkspaceError(
          error,
          "Could not remove this annotation. Please try again."
        )
      ),
  });

  const rawQuestions = (detail.data?.scheme?.questions ??
    []) as SchemeQuestion[];
  const questions = useMemo(
    () =>
      rawQuestions.filter(
        item =>
          item.maximumMarks > 0 &&
          !/pdf not attached|unable to read the paper/i.test(
            `${item.id} ${item.label}`
          )
      ),
    [rawQuestions]
  );
  const rejectedScheme = rawQuestions.length > 0 && questions.length === 0;
  const question = questions[questionIndex];
  const evaluation = useMemo(
    () =>
      detail.data?.evaluations.find(item => item.questionId === question?.id),
    [detail.data?.evaluations, question?.id]
  );
  const extraction = useMemo(
    () =>
      detail.data?.extractions
        .filter(item => item.questionId === question?.id)
        .sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
        )[0],
    [detail.data?.extractions, question?.id]
  );
  const aiCriteria = useMemo(() => {
    const output = evaluation?.aiOutput as
      | {
          criteria?: Array<{
            criterionId: string;
            status:
              | "satisfied"
              | "partial"
              | "missing"
              | "incorrect"
              | "not_applicable";
            evidence: string;
            score?: number;
            maximumScore?: number;
          }>;
        }
      | null
      | undefined;
    return Array.isArray(output?.criteria) ? output.criteria : [];
  }, [evaluation?.aiOutput]);
  const pages = detail.data?.pages ?? [];
  const currentPage = pages.find(item => item.pageNumber === page);
  const pageAnnotations = useMemo(
    () =>
      ((detail.data?.annotations ?? []) as AnnotationRecord[]).filter(
        annotation =>
          annotation.questionId === question?.id &&
          annotation.pageNumber === page
      ),
    [detail.data?.annotations, page, question?.id]
  );
  const latestModel =
    detail.data?.latestGeneration?.model ??
    detail.data?.evaluations.find(item => item.aiModel)?.aiModel ??
    "Not evaluated";
  const relevantEvaluations = (detail.data?.evaluations ?? []).filter(item =>
    questions.some(question => question.id === item.questionId)
  );
  const humanTotal = relevantEvaluations.reduce(
    (sum, item) => sum + (item.humanMarks ?? 0),
    0
  );
  const aiTotal = relevantEvaluations.reduce(
    (sum, item) => sum + (item.aiMarks ?? 0),
    0
  );
  const markedCount = relevantEvaluations.filter(
    item => item.humanMarks !== null
  ).length;
  const isFinalized =
    detail.data?.bundle.status === "finalized" &&
    detail.data?.bundle.processingState === "completed";
  const remainingFinalMarks = questions.filter(question => {
    const row = detail.data?.evaluations.find(
      evaluation => evaluation.questionId === question.id
    );
    return row?.humanMarks === null || row?.humanMarks === undefined;
  }).length;
  const hasPendingReview = relevantEvaluations.some(
    item => item.humanDecision === "review"
  );
  const markChoices = useMemo(
    () =>
      question
        ? Array.from(
            { length: question.maximumMarks * 2 + 1 },
            (_, index) => index / 2
          )
        : [],
    [question?.maximumMarks]
  );
  const questionMaximumTotal = questions.reduce(
    (total, item) => total + item.maximumMarks,
    0
  );

  useEffect(() => {
    setQuestionIndex(0);
    setPage(1);
    setZoom(100);
    setPageRotations({});
    setVisitedPages({});
    setAnnotationUndoStack([]);
    setAnnotationRedoStack([]);
    setAnnotationTool("pan");
    setMarkDrafts({});
    setDirtyMarks({});
    setMarkAnnotationPosition(null);
  }, [bundleId]);

  useEffect(() => {
    if (
      !isCheckingWorkspace ||
      !bundleId ||
      openedWorkspaces.current.has(bundleId)
    )
      return;
    openedWorkspaces.current.add(bundleId);
    openChecking.mutate({ bundleId });
  }, [bundleId, isCheckingWorkspace, openChecking]);

  useEffect(() => {
    if (questionIndex >= questions.length) setQuestionIndex(0);
  }, [questionIndex, questions.length]);

  useEffect(() => {
    setHumanMark(evaluation?.humanMarks ?? "");
    setDecisionReason(evaluation?.decisionReason ?? "");
    setTeacherComment(evaluation?.teacherComment ?? "");
  }, [evaluation?.id, evaluation?.humanMarks, question?.id]);

  useEffect(() => {
    if (question)
      setVisitedPages(current => ({
        ...current,
        [question.id]: Array.from(
          new Set([
            ...(current[question.id] ?? []),
            ...((evaluation?.pagesViewed as number[] | null) ?? []),
            page,
          ])
        ).sort((a, b) => a - b),
      }));
  }, [evaluation?.pagesViewed, page, question?.id]);

  useEffect(() => {
    setMarkDrafts(current => {
      const next = { ...current };
      for (const item of questions) {
        if (dirtyMarks[item.id]) continue;
        const stored = detail.data?.evaluations.find(
          row => row.questionId === item.id
        )?.humanMarks;
        next[item.id] = stored ?? "";
      }
      return next;
    });
  }, [detail.data?.evaluations, dirtyMarks, questions]);

  const visitPage = (target: number) => {
    const safe = Math.max(
      1,
      Math.min(detail.data?.bundle.pageCount ?? 1, target)
    );
    setPage(safe);
    if (question)
      setVisitedPages(current => ({
        ...current,
        [question.id]: Array.from(
          new Set([...(current[question.id] ?? []), safe])
        ).sort((a, b) => a - b),
      }));
  };

  useEffect(() => {
    if (!question || !extraction?.pageNumber) return;
    const target = Math.max(
      1,
      Math.min(detail.data?.bundle.pageCount ?? 1, extraction.pageNumber)
    );
    setPage(target);
    setVisitedPages(current => ({
      ...current,
      [question.id]: Array.from(
        new Set([...(current[question.id] ?? []), target])
      ).sort((left, right) => left - right),
    }));
  }, [detail.data?.bundle.pageCount, extraction?.pageNumber, question?.id]);

  const updateMarkDraft = (
    questionId: string,
    maximumMarks: number,
    value: string
  ) => {
    const next =
      value === ""
        ? ""
        : Math.min(
            maximumMarks,
            Math.max(0, Math.round(Number(value) * 2) / 2)
          );
    setMarkDrafts(current => ({ ...current, [questionId]: next }));
    setDirtyMarks(current => ({ ...current, [questionId]: true }));
    if (questionId === question?.id) setHumanMark(next);
  };

  const persist = (
    humanDecision?: "accept" | "modify" | "override" | "review",
    nextQuestionIndex?: number,
    options?: {
      mark?: number | "";
      annotationPosition?: { pageNumber: number; x: number; y: number };
    }
  ) => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    if (!detail.data || !question) return;
    const selectedMark = options?.mark ?? humanMark;
    const requested =
      humanDecision === "accept" &&
      evaluation?.aiMarks !== null &&
      evaluation?.aiMarks !== undefined
        ? evaluation.aiMarks
        : selectedMark === ""
          ? null
          : Number(selectedMark);
    const allViewed = Array.from(
      new Set([
        ...(visitedPages[question.id] ?? []),
        ...((evaluation?.pagesViewed as number[] | null) ?? []),
        page,
        ...(options?.annotationPosition
          ? [options.annotationPosition.pageNumber]
          : []),
      ])
    ).sort((a, b) => a - b);
    save.mutate(
      {
        id: evaluation?.id,
        bundleId,
        questionId: question.id,
        questionLabel: question.label,
        schemeMaximum: question.maximumMarks,
        humanMarks: requested,
        pagesViewed: allViewed,
        humanDecision,
        decisionReason: decisionReason || undefined,
        teacherComment: teacherComment || undefined,
        markAnnotation:
          options?.annotationPosition ?? markAnnotationPosition ?? undefined,
      },
      {
        onSuccess: result => {
          const savedMark = result.humanMarks ?? "";
          setHumanMark(savedMark);
          setMarkDrafts(current => ({ ...current, [question.id]: savedMark }));
          setDirtyMarks(current => {
            const { [question.id]: _, ...rest } = current;
            return rest;
          });
          setMarkAnnotationPosition(null);
          if (nextQuestionIndex !== undefined)
            setQuestionIndex(nextQuestionIndex);
        },
      }
    );
  };

  const saveGridMark = (item: SchemeQuestion, index: number) => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    if (!detail.data) return;
    const itemEvaluation = detail.data.evaluations.find(
      row => row.questionId === item.id
    );
    const selectedMark =
      markDrafts[item.id] ?? itemEvaluation?.humanMarks ?? "";
    if (selectedMark === "") {
      toast.error("Enter a teacher mark before saving this question.");
      return;
    }
    const itemExtraction = detail.data.extractions
      .filter(row => row.questionId === item.id)
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
      )[0];
    const pagesViewed = Array.from(
      new Set([
        ...((itemEvaluation?.pagesViewed as number[] | null) ?? []),
        itemExtraction?.pageNumber ?? 1,
      ])
    ).sort((left, right) => left - right);
    const humanDecision =
      itemEvaluation?.aiMarks !== null &&
      itemEvaluation?.aiMarks !== undefined &&
      Number(selectedMark) === itemEvaluation.aiMarks
        ? "accept"
        : "modify";
    save.mutate(
      {
        id: itemEvaluation?.id,
        bundleId,
        questionId: item.id,
        questionLabel: item.label,
        schemeMaximum: item.maximumMarks,
        humanMarks: Number(selectedMark),
        pagesViewed,
        humanDecision,
      },
      {
        onSuccess: result => {
          const savedMark = result.humanMarks ?? "";
          setMarkDrafts(current => ({ ...current, [item.id]: savedMark }));
          setDirtyMarks(current => {
            const { [item.id]: _, ...rest } = current;
            return rest;
          });
          if (questionIndex === index) setHumanMark(savedMark);
        },
      }
    );
  };

  const goToQuestion = (targetIndex: number) => {
    if (targetIndex === questionIndex || !question) return;
    const hasUnsavedDecision =
      humanMark !== "" &&
      (humanMark !== (evaluation?.humanMarks ?? "") ||
        teacherComment !== (evaluation?.teacherComment ?? "") ||
        decisionReason !== (evaluation?.decisionReason ?? ""));
    if (!hasUnsavedDecision) {
      setQuestionIndex(targetIndex);
      return;
    }
    const decision =
      evaluation?.aiMarks !== null && evaluation?.aiMarks !== undefined
        ? Number(humanMark) === evaluation.aiMarks
          ? "accept"
          : "modify"
        : "modify";
    persist(decision, targetIndex);
  };

  const annotationPayload = (annotation: AnnotationRecord) => {
    const style = annotation.style
      ? {
          color: annotation.style.color,
          source:
            annotation.style.source === "teacher"
              ? ("teacher" as const)
              : undefined,
          marks: annotation.style.marks,
          maximumMarks: annotation.style.maximumMarks,
        }
      : undefined;
    return {
      bundleId: annotation.bundleId,
      questionId: annotation.questionId,
      pageNumber: annotation.pageNumber,
      type: annotation.type,
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
      content: annotation.content ?? undefined,
      style,
    };
  };

  const createAnnotation = (draft: AnnotationDraft) => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    if (!question) return;
    if (draft.type === "mark") {
      const marks = draft.style?.marks;
      if (marks === undefined) {
        toast.error("Choose a teacher mark before placing it on the answer.");
        return;
      }
      setHumanMark(marks);
      setMarkDrafts(current => ({ ...current, [question.id]: marks }));
      setDirtyMarks(current => ({ ...current, [question.id]: true }));
      persist("modify", undefined, {
        mark: marks,
        annotationPosition: { pageNumber: page, x: draft.x, y: draft.y },
      });
      return;
    }
    const style = draft.style
      ? {
          color: draft.style.color,
          source:
            draft.style.source === "teacher" ? ("teacher" as const) : undefined,
          marks: draft.style.marks,
          maximumMarks: draft.style.maximumMarks,
        }
      : undefined;
    annotationCreate.mutate(
      {
        bundleId,
        questionId: question.id,
        pageNumber: page,
        ...draft,
        content: draft.content ?? undefined,
        style,
      },
      {
        onSuccess: result => {
          const annotation = result.annotation as AnnotationRecord;
          setAnnotationUndoStack(current => [
            ...current,
            { action: "create", annotation },
          ]);
          setAnnotationRedoStack([]);
          detail.refetch();
        },
      }
    );
  };

  const editScoreMark = (annotation: AnnotationRecord) => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    const marks = annotation.style?.marks;
    if (!question || marks === undefined) return;
    setHumanMark(marks);
    setMarkDrafts(current => ({ ...current, [question.id]: marks }));
    setDirtyMarks(current => ({ ...current, [question.id]: true }));
    setMarkAnnotationPosition({
      pageNumber: annotation.pageNumber,
      x: annotation.x,
      y: annotation.y,
    });
    setAnnotationTool("mark");
  };

  const removeAnnotation = (annotation: AnnotationRecord) => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    if (annotation.type === "mark" && annotation.style?.source === "teacher") {
      toast.error("Edit the teacher mark to change the saved score.");
      return;
    }
    annotationDelete.mutate(
      { id: annotation.id },
      {
        onSuccess: () => {
          setAnnotationUndoStack(current => [
            ...current,
            { action: "delete", annotation },
          ]);
          setAnnotationRedoStack([]);
          detail.refetch();
        },
      }
    );
  };

  const undoAnnotation = () => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    const entry = annotationUndoStack.at(-1);
    if (!entry || annotationCreate.isPending || annotationDelete.isPending)
      return;
    if (entry.action === "create") {
      annotationDelete.mutate(
        { id: entry.annotation.id },
        {
          onSuccess: () => {
            setAnnotationUndoStack(current => current.slice(0, -1));
            setAnnotationRedoStack(current => [...current, entry]);
            detail.refetch();
          },
        }
      );
      return;
    }
    annotationCreate.mutate(annotationPayload(entry.annotation), {
      onSuccess: result => {
        const restored = result.annotation as AnnotationRecord;
        setAnnotationUndoStack(current => current.slice(0, -1));
        setAnnotationRedoStack(current => [
          ...current,
          { action: "delete", annotation: restored },
        ]);
        detail.refetch();
      },
    });
  };

  const redoAnnotation = () => {
    if (isFinalized) {
      toast.error("This paper is finalized and can no longer be changed.");
      return;
    }
    const entry = annotationRedoStack.at(-1);
    if (!entry || annotationCreate.isPending || annotationDelete.isPending)
      return;
    if (entry.action === "create") {
      annotationCreate.mutate(annotationPayload(entry.annotation), {
        onSuccess: result => {
          const recreated = result.annotation as AnnotationRecord;
          setAnnotationRedoStack(current => current.slice(0, -1));
          setAnnotationUndoStack(current => [
            ...current,
            { action: "create", annotation: recreated },
          ]);
          detail.refetch();
        },
      });
      return;
    }
    annotationDelete.mutate(
      { id: entry.annotation.id },
      {
        onSuccess: () => {
          setAnnotationRedoStack(current => current.slice(0, -1));
          setAnnotationUndoStack(current => [...current, entry]);
          detail.refetch();
        },
      }
    );
  };

  const annotationToolClass = (tool: AnnotationTool) =>
    `press grid h-7 w-7 place-items-center rounded-md border transition ${
      annotationTool === tool
        ? "border-[#2f6f95] bg-[#eaf6fd] text-[#163044]"
        : "border-transparent text-[#587181] hover:border-[#b6d6e8] hover:bg-white"
    }`;

  const pageRotation = pageRotations[page] ?? 0;
  const rotatePaperClockwise = () => {
    setPageRotations(current => ({
      ...current,
      [page]: ((current[page] ?? 0) + 90) % 360,
    }));
  };

  const annotationRailToolClass = (tool: AnnotationTool) =>
    `press grid h-9 w-9 place-items-center rounded-md border transition ${
      annotationTool === tool
        ? "border-[#2f6f95] bg-[#eaf6fd] text-[#163044]"
        : "border-transparent text-[#587181] hover:border-[#b6d6e8] hover:bg-white"
    }`;

  if (!bundles.data?.length)
    return (
      <div className="panel grid min-h-[430px] place-items-center rounded-3xl p-8 text-center">
        <div>
          <FileText className="mx-auto text-[#75afd0]" />
          <h1 className="mt-5 font-display text-5xl">
            Marking starts with an intake bundle.
          </h1>
          <p className="mt-3 text-sm text-[#6b8190]">
            Upload the booklet and its matching question paper first.
          </p>
        </div>
      </div>
    );

  return (
    <div
      data-assistant-question-id={question?.id ?? undefined}
      className={
        isCheckingWorkspace
          ? "flex h-[100dvh] flex-col overflow-y-auto bg-[#f8fcff] text-[#163044] lg:overflow-hidden"
          : "mx-auto max-w-[1500px]"
      }
    >
      {isCheckingWorkspace ? (
        <header className="flex min-h-[62px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#d9eaf3] bg-white px-4 py-2 shadow-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setLocation("/evaluator/papers")}
              aria-label="Back to assigned papers"
              className="press grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#d9eaf3] bg-white text-[#2f6f95]"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <p className="font-display text-xl leading-none text-[#163044]">
                Drishti
              </p>
              <p className="mono-label mt-1 truncate text-[#2f6f95]">
                AI grading workspace
              </p>
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-x-5 gap-y-1 text-xs text-[#587181] sm:flex">
            {detail.data?.bundle.subject ? (
              <span className="max-w-36 truncate">
                <strong className="text-[#163044]">Subject</strong>{" "}
                {detail.data.bundle.subject}
              </span>
            ) : null}
            {detail.data?.bundle.examPaperId ? (
              <span className="max-w-56 truncate">
                <strong className="text-[#163044]">Paper</strong>{" "}
                {detail.data.bundle.examPaperId}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-xs font-semibold text-[#163044]">
                Question {questions.length ? questionIndex + 1 : "-"} of{" "}
                {questions.length || "-"}
              </p>
              <p
                className={`mono-label mt-1 ${save.isPending ? "text-[#b45309]" : save.isError ? "text-[#b64c40]" : "text-[#2f7898]"}`}
              >
                {save.isPending
                  ? "Saving"
                  : save.isError
                    ? "Save failed"
                    : evaluation?.humanMarks !== null &&
                        evaluation?.humanMarks !== undefined
                      ? "Saved"
                      : extraction?.status === "processing"
                        ? "Reading answer"
                        : "Ready"}
              </p>
            </div>
          </div>
        </header>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mono-label text-[#2f6f95]">
              02 · Teacher marking desk
            </p>
            <h1 className="mt-2 max-w-3xl font-display text-5xl leading-[.95] tracking-[-.02em]">
              See the paper clearly. Award every mark.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
              Full-resolution booklet evidence, exact paper maxima, and an
              independent AI reading in one review surface.
            </p>
          </div>
          <select
            value={bundleId}
            onChange={event => setBundleId(event.target.value)}
            className="h-11 min-w-72 rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm outline-none transition focus:border-[#75afd0] focus:ring-2 focus:ring-[#8fc7e8]/20"
          >
            <option value="">Choose booklet</option>
            {bundles.data.map(bundle => (
              <option key={bundle.id} value={bundle.id}>
                {bundle.candidateName} · {bundle.subject}
              </option>
            ))}
          </select>
        </div>
      )}

      {!bundleId ? (
        <div className="panel mt-8 rounded-3xl p-10 text-sm text-[#6b8190]">
          Select an answer booklet to open its full-resolution pages and marking
          controls.
        </div>
      ) : detail.isLoading ? (
        <div className="grid min-h-96 place-items-center">
          <Loader2 className="animate-spin text-[#2f6f95]" />
        </div>
      ) : detail.isError ? (
        <div className="mt-8 rounded-3xl border border-[#efc5bd] bg-[#fff7f5] p-8">
          <AlertCircle className="text-[#b64c40]" />
          <h2 className="mt-4 font-display text-3xl">
            This booklet could not be opened.
          </h2>
          <p className="mt-2 text-sm text-[#6b8190]">
            {safeWorkspaceError(
              detail.error,
              "The marking record is temporarily unavailable. Refresh to try again."
            )}
          </p>
        </div>
      ) : (
        <>
          {!isCheckingWorkspace ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Paper total"
                value={`${questionMaximumTotal || detail.data?.denominator.total || 0} marks`}
                detail={`Source · ${detail.data?.denominator.source ?? "unknown"}`}
                accent
              />
              <Stat
                label="AI reader"
                value={latestModel}
                detail={
                  detail.data?.latestGeneration?.status ??
                  "Ready for verified document reading"
                }
              />
              <Stat
                label="Evidence pages"
                value={`${pages.length} / ${detail.data?.bundle.pageCount ?? 0}`}
                detail={`${markedCount} of ${questions.length} questions marked`}
              />
              <Stat
                label="Booklet integrity"
                value={
                  detail.data?.documentIntegrity.hasAnswerBooklet
                    ? "Source present"
                    : "Source missing"
                }
                detail={
                  detail.data?.documentIntegrity.hasQuestionPaper
                    ? "Question paper linked"
                    : "Question paper missing"
                }
              />
            </div>
          ) : null}

          {!isCheckingWorkspace ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eadcae] bg-[#fffaf0] px-5 py-4">
              <div>
                <p className="mono-label text-[#2f6f95]">Evaluation handoff</p>
                <p className="mt-1 text-xs text-[#6b8190]">
                  Save every question before submitting this assigned paper.
                </p>
              </div>
              <button
                onClick={() => submit.mutate({ bundleId })}
                disabled={
                  submit.isPending ||
                  !questions.length ||
                  markedCount !== questions.length
                }
                className="press flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <CheckCircle2 size={15} />
                SUBMIT EVALUATION
              </button>
            </div>
          ) : null}

          <div
            className={`${isCheckingWorkspace ? "mx-2 mt-1 grid min-h-0 flex-1 overflow-hidden rounded-xl border border-[#d9eaf3] bg-white shadow-[0_18px_50px_-36px_rgba(28,25,23,.32)] lg:grid-cols-[208px_minmax(0,1fr)_248px] 2xl:grid-cols-[232px_minmax(0,1fr)_296px]" : "mt-5 grid overflow-hidden rounded-[28px] border border-[#ddd8cf] bg-white shadow-[0_24px_70px_-45px_rgba(28,25,23,.35)] lg:grid-cols-[260px_minmax(0,1fr)_340px]"}`}
          >
            <aside
              className={`flex min-h-0 min-w-0 flex-col border-b border-[#d9eaf3] bg-[#f8fcff] ${isCheckingWorkspace ? "h-[17.5rem] overflow-hidden lg:h-auto" : "p-4"} lg:border-b-0 lg:border-r`}
            >
              <div
                className={
                  isCheckingWorkspace
                    ? "flex items-center justify-between border-b border-[#d9eaf3] px-3 py-2.5"
                    : "flex items-center justify-between"
                }
              >
                <div>
                  <p className="mono-label text-[#2f6f95]">Question marking</p>
                  <p className="mt-1 text-xs text-[#6b8190]">
                    {detail.data?.bundle.subject} · {markedCount}/
                    {questions.length} saved
                  </p>
                </div>
                <span className="rounded-full bg-[#eaf6fd] px-2 py-1 font-mono text-[9px] text-[#2f6f95]">
                  {humanTotal} / {questionMaximumTotal}
                </span>
              </div>
              <div
                className={`${isCheckingWorkspace ? "min-h-0 flex-1 overflow-auto" : "mt-3 overflow-x-auto"}`}
              >
                <table
                  className={`${isCheckingWorkspace ? "w-full table-fixed" : "w-full min-w-[300px]"} border-collapse text-left`}
                >
                  <thead className="sticky top-0 z-10 bg-[#f8fcff]">
                    <tr className="border-b border-[#d9eaf3] font-mono text-[9px] uppercase tracking-[.08em] text-[#7f9aaa]">
                      <th className="w-10 px-2 py-2 font-medium">Q.</th>
                      <th className="w-9 px-1 py-2 text-center font-medium">
                        Max
                      </th>
                      <th className="w-[84px] px-1 py-2 text-center font-medium">
                        Teacher
                      </th>
                      <th className="w-8 px-1 py-2 text-center font-medium">
                        AI
                      </th>
                      <th
                        className={`${isCheckingWorkspace ? "hidden" : "px-2 py-2"} font-medium`}
                      >
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((item, index) => {
                      const itemEvaluation = detail.data?.evaluations.find(
                        row => row.questionId === item.id
                      );
                      const status =
                        itemEvaluation?.humanMarks !== null &&
                        itemEvaluation?.humanMarks !== undefined
                          ? "saved"
                          : itemEvaluation?.requiresHumanReview
                            ? "review"
                            : itemEvaluation?.aiMarks !== null &&
                                itemEvaluation?.aiMarks !== undefined
                              ? "AI ready"
                              : "new";
                      const draftMark =
                        markDrafts[item.id] ?? itemEvaluation?.humanMarks ?? "";
                      const isDirty = Boolean(dirtyMarks[item.id]);
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-[#e6f0f5] transition ${questionIndex === index ? "bg-[#eaf6fd]" : "hover:bg-white"}`}
                        >
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => goToQuestion(index)}
                              className="press font-mono text-[11px] font-semibold text-[#163044]"
                              title={`Open ${item.questionNumber ?? item.id}`}
                            >
                              {item.questionNumber ?? item.id}
                            </button>
                          </td>
                          <td className="px-1 py-1.5 text-center font-mono text-[11px] text-[#587181]">
                            {item.maximumMarks}
                          </td>
                          <td className="px-1 py-1.5">
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                aria-label={`Teacher mark for ${item.id}`}
                                type="number"
                                step="0.5"
                                min="0"
                                max={item.maximumMarks}
                                value={draftMark}
                                disabled={isFinalized}
                                onFocus={() => setQuestionIndex(index)}
                                onChange={event =>
                                  updateMarkDraft(
                                    item.id,
                                    item.maximumMarks,
                                    event.target.value
                                  )
                                }
                                className={`h-7 w-11 rounded-md border bg-white px-1 text-center text-[11px] font-semibold tabular-nums outline-none focus:border-[#2f6f95] disabled:opacity-55 ${isDirty ? "border-[#b45309]" : "border-[#d9eaf3]"}`}
                              />
                              <button
                                type="button"
                                title={`Save ${item.questionNumber ?? item.id} marks`}
                                aria-label={`Save ${item.questionNumber ?? item.id} marks`}
                                disabled={
                                  isFinalized ||
                                  save.isPending ||
                                  draftMark === "" ||
                                  !isDirty
                                }
                                onClick={() => saveGridMark(item, index)}
                                className="press grid h-7 w-6 place-items-center rounded-md border border-[#d9eaf3] bg-white text-[#2f6f95] disabled:opacity-30"
                              >
                                <Check size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-center font-mono text-[10px] text-[#2f6f95]">
                            {itemEvaluation?.aiMarks ?? "—"}
                          </td>
                          <td
                            className={`${isCheckingWorkspace ? "hidden" : "px-2 py-1.5"} text-[9px] font-semibold uppercase ${status === "saved" ? "text-[#2f7898]" : status === "review" ? "text-[#b45309]" : status === "AI ready" ? "text-[#2f6f95]" : "text-[#7f9aaa]"}`}
                          >
                            {isDirty ? "unsaved" : status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div
                className={`${isCheckingWorkspace ? "border-t px-3 py-2" : "mt-4 border-t pt-3"} border-[#d9eaf3] text-xs text-[#6b8190]`}
              >
                <p>
                  <strong className="text-[#163044]">AI</strong> {aiTotal} /{" "}
                  {questionMaximumTotal}
                </p>
                <p className="mt-1">
                  <strong className="text-[#163044]">Teacher</strong>{" "}
                  {humanTotal} / {questionMaximumTotal}
                </p>
              </div>
            </aside>
            <section
              className={`min-w-0 border-b border-[#d9eaf3] lg:border-b-0 lg:border-r ${isCheckingWorkspace ? "flex min-h-0 flex-col" : ""}`}
            >
              <div
                className={`flex flex-wrap items-center justify-between gap-3 border-b border-[#d9eaf3] px-5 ${isCheckingWorkspace ? "px-3 py-2" : "py-4"}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="mono-label text-[#2f6f95]">
                      {question
                        ? `Question ${question.id}`
                        : "Booklet evidence"}
                    </p>
                    <span className="h-1 w-1 rounded-full bg-[#2f7898]" />
                  </div>
                  <p className="mt-1 max-w-xl truncate text-sm font-semibold">
                    {question?.questionText ??
                      question?.label ??
                      `Page ${page} of ${detail.data?.bundle.pageCount ?? 1}`}
                  </p>
                  <p className="mt-1 text-xs text-[#6b8190]">
                    P {page}/{detail.data?.bundle.pageCount ?? 1} ·{" "}
                    {question?.maximumMarks ?? "-"} marks
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-label="Previous page"
                    onClick={() => visitPage(page - 1)}
                    disabled={page <= 1}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3] disabled:opacity-35"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    aria-label="Next page"
                    onClick={() => visitPage(page + 1)}
                    disabled={page >= (detail.data?.bundle.pageCount ?? 1)}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3] disabled:opacity-35"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <span className="mx-1 h-5 w-px bg-[#d9eaf3]" />
                  <button
                    aria-label="Zoom out"
                    onClick={() => setZoom(value => Math.max(75, value - 25))}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3]"
                  >
                    <ZoomOut size={15} />
                  </button>
                  <button
                    onClick={() => setZoom(100)}
                    className="press h-9 min-w-14 rounded-lg border border-[#d9eaf3] px-2 font-mono text-[10px] tabular-nums"
                  >
                    {zoom === 100 ? "Fit" : `${zoom}%`}
                  </button>
                  <button
                    aria-label="Zoom in"
                    onClick={() => setZoom(value => Math.min(200, value + 25))}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3]"
                  >
                    <ZoomIn size={15} />
                  </button>
                  {detail.data?.bundle.bookletUrl ? (
                    <a
                      aria-label="Open source PDF"
                      href={detail.data.bundle.bookletUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="press grid h-9 w-9 place-items-center rounded-lg bg-[#163044] text-white"
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </div>

              <div
                className={`${isCheckingWorkspace ? "flex min-h-[30rem] flex-1 overflow-hidden bg-[#ebe9e4] lg:min-h-0" : ""}`}
              >
                {isCheckingWorkspace && !isFinalized ? (
                  <aside
                    aria-label="Annotation tools"
                    className="flex w-[80px] shrink-0 flex-col items-center border-r border-[#d9eaf3] bg-[#f8fcff] py-1.5"
                  >
                    <div className="grid grid-cols-2 gap-0.5">
                      <button
                        type="button"
                        title="Check mark"
                        aria-label="Check mark"
                        onClick={() => setAnnotationTool("check")}
                        className={annotationRailToolClass("check")}
                      >
                        <Check size={18} />
                      </button>
                      <button
                        type="button"
                        title="Cross mark"
                        aria-label="Cross mark"
                        onClick={() => setAnnotationTool("cross")}
                        className={annotationRailToolClass("cross")}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <span className="my-1 h-px w-14 bg-[#d9eaf3]" />
                    <div className="grid grid-cols-2 gap-0.5">
                      <button
                        type="button"
                        title="Circle answer area"
                        aria-label="Circle answer area"
                        onClick={() => setAnnotationTool("circle")}
                        className={annotationRailToolClass("circle")}
                      >
                        <Circle size={18} />
                      </button>
                      <button
                        type="button"
                        title="Underline evidence"
                        aria-label="Underline evidence"
                        onClick={() => setAnnotationTool("underline")}
                        className={annotationRailToolClass("underline")}
                      >
                        <Underline size={18} />
                      </button>
                      <button
                        type="button"
                        title="Highlight evidence"
                        aria-label="Highlight evidence"
                        onClick={() => setAnnotationTool("highlight")}
                        className={annotationRailToolClass("highlight")}
                      >
                        <Highlighter size={18} />
                      </button>
                      <button
                        type="button"
                        title="Add comment"
                        aria-label="Add comment"
                        onClick={() => setAnnotationTool("comment")}
                        className={annotationRailToolClass("comment")}
                      >
                        <MessageSquarePlus size={18} />
                      </button>
                    </div>
                    <span className="my-1 h-px w-14 bg-[#d9eaf3]" />
                    <div className="grid grid-cols-2 gap-0.5">
                      <button
                        type="button"
                        title="Flag for review"
                        aria-label="Flag for review"
                        onClick={() => setAnnotationTool("review")}
                        className={annotationRailToolClass("review")}
                      >
                        <Flag size={18} />
                      </button>
                      <button
                        type="button"
                        title="Place teacher mark"
                        aria-label="Place teacher mark"
                        onClick={() => setAnnotationTool("mark")}
                        className={annotationRailToolClass("mark")}
                      >
                        <Award size={18} />
                      </button>
                      <button
                        type="button"
                        title="Eraser"
                        aria-label="Eraser"
                        onClick={() => setAnnotationTool("eraser")}
                        className={annotationRailToolClass("eraser")}
                      >
                        <Eraser size={18} />
                      </button>
                    </div>
                    <span className="my-1 h-px w-14 bg-[#d9eaf3]" />
                    <div className="grid grid-cols-2 gap-0.5">
                      <button
                        type="button"
                        title="Undo annotation"
                        aria-label="Undo annotation"
                        onClick={undoAnnotation}
                        disabled={
                          !annotationUndoStack.length ||
                          annotationCreate.isPending ||
                          annotationDelete.isPending
                        }
                        className="press grid h-9 w-9 place-items-center rounded-md border border-transparent text-[#587181] transition hover:border-[#b6d6e8] hover:bg-white disabled:opacity-30"
                      >
                        <Undo2 size={18} />
                      </button>
                      <button
                        type="button"
                        title="Redo annotation"
                        aria-label="Redo annotation"
                        onClick={redoAnnotation}
                        disabled={
                          !annotationRedoStack.length ||
                          annotationCreate.isPending ||
                          annotationDelete.isPending
                        }
                        className="press grid h-9 w-9 place-items-center rounded-md border border-transparent text-[#587181] transition hover:border-[#b6d6e8] hover:bg-white disabled:opacity-30"
                      >
                        <Redo2 size={18} />
                      </button>
                      <button
                        type="button"
                        title="Move around page"
                        aria-label="Move around page"
                        onClick={() => setAnnotationTool("pan")}
                        className={annotationRailToolClass("pan")}
                      >
                        <Hand size={18} />
                      </button>
                      <button
                        type="button"
                        title={`Rotate paper clockwise${pageRotation ? ` (${pageRotation}°)` : ""}`}
                        aria-label="Rotate paper clockwise"
                        onClick={rotatePaperClockwise}
                        className="press grid h-9 w-9 place-items-center rounded-md border border-transparent text-[#587181] transition hover:border-[#b6d6e8] hover:bg-white"
                      >
                        <RotateCw size={18} />
                      </button>
                    </div>
                  </aside>
                ) : null}
                <div
                  data-answer-viewport
                  className={`${isCheckingWorkspace ? "min-w-0 flex-1 overflow-auto bg-[#ebe9e4]" : "h-[clamp(520px,68vh,760px)] overflow-auto bg-[#ebe9e4]"}`}
                >
                  <PdfEvidence
                    sourceUrl={detail.data?.bundle.bookletUrl}
                    fallbackUrl={currentPage?.pageDataUrl}
                    page={page}
                    zoom={zoom}
                    rotation={pageRotation}
                    compact={isCheckingWorkspace}
                    annotations={pageAnnotations}
                    annotationTool={annotationTool}
                    markValue={
                      typeof humanMark === "number"
                        ? humanMark
                        : (evaluation?.aiMarks ?? 0)
                    }
                    markMaximum={question?.maximumMarks ?? 1}
                    onCreateAnnotation={createAnnotation}
                    onDeleteAnnotation={removeAnnotation}
                    onEditScoreMark={editScoreMark}
                    toolbar={
                      !isCheckingWorkspace && !isFinalized ? (
                        <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-[#b6d6e8] bg-white/95 p-1 shadow-md backdrop-blur">
                          <button
                            type="button"
                            title="Check mark"
                            aria-label="Check mark"
                            onClick={() => setAnnotationTool("check")}
                            className={annotationToolClass("check")}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            title="Cross mark"
                            aria-label="Cross mark"
                            onClick={() => setAnnotationTool("cross")}
                            className={annotationToolClass("cross")}
                          >
                            <X size={14} />
                          </button>
                          <button
                            type="button"
                            title="Circle answer area"
                            aria-label="Circle answer area"
                            onClick={() => setAnnotationTool("circle")}
                            className={annotationToolClass("circle")}
                          >
                            <Circle size={13} />
                          </button>
                          <button
                            type="button"
                            title="Underline evidence"
                            aria-label="Underline evidence"
                            onClick={() => setAnnotationTool("underline")}
                            className={annotationToolClass("underline")}
                          >
                            <Underline size={14} />
                          </button>
                          <button
                            type="button"
                            title="Highlight evidence"
                            aria-label="Highlight evidence"
                            onClick={() => setAnnotationTool("highlight")}
                            className={annotationToolClass("highlight")}
                          >
                            <Highlighter size={14} />
                          </button>
                          <button
                            type="button"
                            title="Add comment"
                            aria-label="Add comment"
                            onClick={() => setAnnotationTool("comment")}
                            className={annotationToolClass("comment")}
                          >
                            <MessageSquarePlus size={14} />
                          </button>
                          <button
                            type="button"
                            title="Flag for review"
                            aria-label="Flag for review"
                            onClick={() => setAnnotationTool("review")}
                            className={annotationToolClass("review")}
                          >
                            <Flag size={13} />
                          </button>
                          <button
                            type="button"
                            title="Place teacher mark"
                            aria-label="Place teacher mark"
                            onClick={() => setAnnotationTool("mark")}
                            className={annotationToolClass("mark")}
                          >
                            <Award size={14} />
                          </button>
                          <button
                            type="button"
                            title="Eraser"
                            aria-label="Eraser"
                            onClick={() => setAnnotationTool("eraser")}
                            className={annotationToolClass("eraser")}
                          >
                            <Eraser size={14} />
                          </button>
                          <button
                            type="button"
                            title="Move around page"
                            aria-label="Move around page"
                            onClick={() => setAnnotationTool("pan")}
                            className={annotationToolClass("pan")}
                          >
                            <Hand size={14} />
                          </button>
                          <button
                            type="button"
                            title={`Rotate paper clockwise${pageRotation ? ` (${pageRotation}°)` : ""}`}
                            aria-label="Rotate paper clockwise"
                            onClick={rotatePaperClockwise}
                            className="press grid h-7 w-7 place-items-center rounded-md border border-transparent text-[#587181] transition hover:border-[#b6d6e8] hover:bg-white"
                          >
                            <RotateCw size={14} />
                          </button>
                          <button
                            type="button"
                            title="Undo annotation"
                            aria-label="Undo annotation"
                            onClick={undoAnnotation}
                            disabled={
                              !annotationUndoStack.length ||
                              annotationCreate.isPending ||
                              annotationDelete.isPending
                            }
                            className="press grid h-7 w-7 place-items-center rounded-md text-[#587181] hover:bg-white disabled:opacity-30"
                          >
                            <Undo2 size={14} />
                          </button>
                          <button
                            type="button"
                            title="Redo annotation"
                            aria-label="Redo annotation"
                            onClick={redoAnnotation}
                            disabled={
                              !annotationRedoStack.length ||
                              annotationCreate.isPending ||
                              annotationDelete.isPending
                            }
                            className="press grid h-7 w-7 place-items-center rounded-md text-[#587181] hover:bg-white disabled:opacity-30"
                          >
                            <Redo2 size={14} />
                          </button>
                        </div>
                      ) : undefined
                    }
                  />
                </div>
              </div>

              <div
                className={`flex gap-2 overflow-x-auto border-t border-[#d9eaf3] bg-[#fbfaf8] ${isCheckingWorkspace ? "p-1.5" : "p-3"}`}
              >
                {pages.map(item => (
                  <button
                    key={item.pageNumber}
                    onClick={() => visitPage(item.pageNumber)}
                    className={`group relative shrink-0 overflow-hidden rounded-lg border bg-white p-1 text-left transition ${isCheckingWorkspace ? "w-14" : "w-24 p-1.5"} ${page === item.pageNumber ? "border-[#2f6f95] ring-2 ring-[#8fc7e8]/35" : "border-[#d9eaf3] hover:border-[#75afd0]"}`}
                  >
                    <img
                      src={
                        item.pageDataUrl ??
                        (item.pageNumber === 1
                          ? (detail.data?.bundle.bookletUrl ?? "")
                          : "")
                      }
                      alt={`Thumbnail for page ${item.pageNumber}`}
                      className={`${isCheckingWorkspace ? "h-8" : "h-16"} w-full rounded-md bg-[#f3f1ec] object-cover object-top`}
                    />
                    <span
                      className={`${isCheckingWorkspace ? "mt-1" : "mt-1.5"} flex items-center justify-between font-mono text-[9px] text-[#6b8190]`}
                    >
                      <span>
                        {isCheckingWorkspace
                          ? `P${item.pageNumber}`
                          : `PAGE ${item.pageNumber}`}
                      </span>
                      <span
                        className={
                          item.clarity === "CLEAR"
                            ? "text-[#2f7898]"
                            : "text-[#b45309]"
                        }
                      >
                        {item.clarity}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section
              className={`flex min-w-0 flex-col ${isCheckingWorkspace ? "min-h-0 overflow-hidden p-3" : "min-h-[700px] p-5 sm:p-6"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono-label text-[#2f6f95]">AI / marks</p>
                  <h2
                    className={`${isCheckingWorkspace ? "mt-1 text-sm font-semibold" : "mt-1 truncate font-display text-3xl"}`}
                  >
                    {isCheckingWorkspace
                      ? "Decision"
                      : question
                        ? `${question.questionNumber ?? question.id} · ${question.questionText ?? question.label}`
                        : rejectedScheme
                          ? "Paper read needs repair"
                          : "Add questions and marks"}
                  </h2>
                </div>
                {questions.length ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() =>
                        question &&
                        aiQuestion.mutate({ bundleId, questionId: question.id })
                      }
                      disabled={isFinalized || aiQuestion.isPending}
                      className="press flex items-center gap-1.5 rounded-full bg-[#163044] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {aiQuestion.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {aiQuestion.isPending
                        ? "AI is evaluating"
                        : evaluation?.aiMarks === null ||
                            evaluation?.aiMarks === undefined
                          ? "AI evaluate"
                          : "Re-evaluate"}
                    </button>
                  </div>
                ) : null}
              </div>

              {question ? (
                <>
                  {!isCheckingWorkspace ? (
                    <div className="mt-4 rounded-2xl bg-[#f8f6f1] p-5">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="mono-label text-[#7f9aaa]">
                            Question maximum
                          </p>
                          <p className="mt-2 font-display text-5xl tabular-nums">
                            {question.maximumMarks}
                            <span className="ml-1 text-lg text-[#6b8190]">
                              marks
                            </span>
                          </p>
                        </div>
                        <span className="rounded-full border border-[#d7eadc] bg-[#eef8f1] px-3 py-1.5 font-mono text-[9px] text-[#2f7898]">
                          <ShieldCheck className="mr-1 inline" size={12} />
                          SCHEME VERIFIED
                        </span>
                      </div>
                      {question.keyPoints.length ? (
                        <div className="mt-4 border-t border-[#d9eaf3] pt-3">
                          <p className="mono-label text-[#2f6f95]">
                            Reference points
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[#587181]">
                            {question.keyPoints.join(" · ")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    className={`${isCheckingWorkspace ? "mt-3" : "mt-4"} grid grid-cols-2 gap-2.5`}
                  >
                    <div
                      className={`rounded-xl border border-[#d9eaf3] ${isCheckingWorkspace ? "p-3" : "p-4"}`}
                    >
                      <p className="mono-label text-[#7f9aaa]">AI mark</p>
                      <p
                        className={`${isCheckingWorkspace ? "mt-1 text-3xl" : "mt-3 font-display text-4xl"} tabular-nums`}
                      >
                        {evaluation?.aiMarks ?? "—"}
                        <span className="ml-1 text-base text-[#7f9aaa]">
                          / {question.maximumMarks}
                        </span>
                      </p>
                      <p
                        className={`${isCheckingWorkspace ? "mt-1" : "mt-2 line-clamp-4"} text-xs leading-5 text-[#6b8190]`}
                      >
                        {isCheckingWorkspace
                          ? evaluation?.aiMarks !== null &&
                            evaluation?.aiMarks !== undefined
                            ? "AI ready"
                            : "Not run"
                          : (evaluation?.feedback ??
                            "AI grading is not available yet.")}
                      </p>
                      {evaluation?.confidence !== null &&
                      evaluation?.confidence !== undefined ? (
                        <p
                          className={`${isCheckingWorkspace ? "mt-2" : "mt-3 border-t border-[#eeeae3] pt-2"} font-mono text-[9px] text-[#2f6f95]`}
                        >
                          CONFIDENCE {evaluation.confidence}%
                        </p>
                      ) : null}
                    </div>
                    <label
                      className={`rounded-xl border border-[#d9eaf3] ${isCheckingWorkspace ? "p-3" : "p-4"}`}
                    >
                      <span className="mono-label text-[#7f9aaa]">
                        Award mark
                      </span>
                      <input
                        aria-label={`Award mark for ${question.id}`}
                        type="number"
                        step="0.5"
                        min="0"
                        max={question.maximumMarks}
                        value={humanMark}
                        disabled={isFinalized}
                        onChange={event =>
                          updateMarkDraft(
                            question.id,
                            question.maximumMarks,
                            event.target.value
                          )
                        }
                        className={`${isCheckingWorkspace ? "mt-1 text-3xl" : "mt-2 font-display text-4xl"} w-full border-b border-[#d9d3c9] bg-transparent outline-none transition focus:border-[#75afd0]`}
                      />
                      <span
                        className={`${isCheckingWorkspace ? "mt-1" : "mt-2"} block text-xs text-[#6b8190]`}
                      >
                        Maximum: {question.maximumMarks} marks.
                      </span>
                    </label>
                  </div>

                  {annotationTool === "mark" ? (
                    <div className="mt-2 rounded-lg border border-[#d7eadc] bg-[#f5fbf7] p-2">
                      <span className="mono-label block text-[#28734b]">
                        Place mark
                      </span>
                      <div className="mt-1.5 grid grid-cols-6 gap-1">
                        {markChoices.map(value => (
                          <button
                            key={value}
                            type="button"
                            disabled={isFinalized}
                            onClick={() =>
                              updateMarkDraft(
                                question.id,
                                question.maximumMarks,
                                String(value)
                              )
                            }
                            className={`press min-w-0 rounded-md border px-1 py-1.5 font-mono text-[10px] disabled:opacity-50 ${humanMark === value ? "border-[#28734b] bg-[#e5f4ec] text-[#205c3c]" : "border-[#d7eadc] bg-white text-[#587181]"}`}
                          >
                            +{value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {evaluation?.aiMarks !== null &&
                  evaluation?.aiMarks !== undefined ? (
                    <div
                      className={`${isCheckingWorkspace ? "mt-3" : "mt-4"} grid grid-cols-3 gap-2`}
                    >
                      <button
                        onClick={() => persist("accept")}
                        disabled={isFinalized || save.isPending}
                        className="press rounded-xl bg-[#2f6f95] px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => persist("modify")}
                        disabled={
                          isFinalized || save.isPending || humanMark === ""
                        }
                        className="press rounded-xl border border-[#d9eaf3] bg-white px-3 py-2.5 text-xs font-semibold text-[#2f6f95] disabled:opacity-50"
                      >
                        Modify
                      </button>
                      <button
                        onClick={() => persist("override")}
                        disabled={
                          isFinalized || save.isPending || humanMark === ""
                        }
                        className="press rounded-xl border border-[#eadcae] bg-[#fffaf0] px-3 py-2.5 text-xs font-semibold text-[#a65c00] disabled:opacity-50"
                      >
                        Override
                      </button>
                    </div>
                  ) : null}
                  {isCheckingWorkspace ? (
                    <details className="mt-3 rounded-lg border border-[#d9eaf3] bg-[#fbfdff] px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium text-[#587181]">
                        Comment or override reason
                      </summary>
                      <label className="mt-3 block">
                        <span className="mono-label text-[#7f9aaa]">
                          Teacher note
                        </span>
                        <textarea
                          value={teacherComment}
                          disabled={isFinalized}
                          onChange={event =>
                            setTeacherComment(event.target.value)
                          }
                          placeholder="Optional note for the evaluation record"
                          className="mt-1 min-h-16 w-full resize-y rounded-lg border border-[#d9eaf3] bg-white p-2 text-sm outline-none focus:border-[#75afd0] disabled:opacity-55"
                        />
                      </label>
                      <label className="mt-3 block">
                        <span className="mono-label text-[#7f9aaa]">
                          Decision reason
                        </span>
                        <input
                          value={decisionReason}
                          disabled={isFinalized}
                          onChange={event =>
                            setDecisionReason(event.target.value)
                          }
                          placeholder="Required when overriding a score"
                          className="mt-1 h-9 w-full rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm outline-none focus:border-[#75afd0] disabled:opacity-55"
                        />
                      </label>
                    </details>
                  ) : (
                    <>
                      <label className="mt-3 block">
                        <span className="mono-label text-[#7f9aaa]">
                          Teacher note or override reason
                        </span>
                        <textarea
                          value={teacherComment}
                          disabled={isFinalized}
                          onChange={event =>
                            setTeacherComment(event.target.value)
                          }
                          placeholder="Optional note for the evaluation record"
                          className="mt-2 min-h-20 w-full resize-y rounded-xl border border-[#d9eaf3] bg-white p-3 text-sm outline-none focus:border-[#75afd0] disabled:opacity-55"
                        />
                      </label>
                      <label className="mt-3 block">
                        <span className="mono-label text-[#7f9aaa]">
                          Decision reason
                        </span>
                        <input
                          value={decisionReason}
                          disabled={isFinalized}
                          onChange={event =>
                            setDecisionReason(event.target.value)
                          }
                          placeholder="Required when overriding a score"
                          className="mt-2 h-10 w-full rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm outline-none focus:border-[#75afd0] disabled:opacity-55"
                        />
                      </label>
                    </>
                  )}

                  <button
                    onClick={() =>
                      persist(
                        evaluation?.aiMarks === null ||
                          evaluation?.aiMarks === undefined
                          ? "modify"
                          : "override"
                      )
                    }
                    disabled={isFinalized || save.isPending}
                    className={`${isCheckingWorkspace ? "mt-3" : "mt-4"} press flex items-center justify-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50`}
                  >
                    {save.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Save decision
                  </button>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const storedMark = evaluation?.humanMarks ?? "";
                        setHumanMark(storedMark);
                        setMarkDrafts(current => ({
                          ...current,
                          [question.id]: storedMark,
                        }));
                        setDirtyMarks(current => {
                          const { [question.id]: _, ...rest } = current;
                          return rest;
                        });
                        setMarkAnnotationPosition(null);
                        setTeacherComment(evaluation?.teacherComment ?? "");
                        setDecisionReason(evaluation?.decisionReason ?? "");
                      }}
                      disabled={isFinalized}
                      className="press rounded-xl border border-[#d9eaf3] bg-white px-2 py-2.5 text-xs font-medium text-[#587181] disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => persist("review")}
                      disabled={isFinalized || save.isPending}
                      className="press rounded-xl border border-[#eadcae] bg-[#fffaf0] px-2 py-2.5 text-xs font-medium text-[#a65c00] disabled:opacity-50"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => goToQuestion(questionIndex - 1)}
                      disabled={questionIndex === 0 || save.isPending}
                      className="press rounded-xl border border-[#d9eaf3] bg-white px-2 py-2.5 text-xs font-medium text-[#587181] disabled:opacity-50"
                    >
                      Previous
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      persist(
                        evaluation?.aiMarks === null ||
                          evaluation?.aiMarks === undefined
                          ? "modify"
                          : "override",
                        questionIndex + 1
                      )
                    }
                    disabled={
                      isFinalized ||
                      save.isPending ||
                      questionIndex >= questions.length - 1
                    }
                    className="press mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9eaf3] bg-white px-4 py-3 text-sm font-semibold text-[#2f6f95] disabled:opacity-50"
                  >
                    <ChevronRight size={15} />
                    Save and next
                  </button>

                  <div
                    className={`${isCheckingWorkspace ? "mt-3" : "mt-auto pt-6"}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6b8190]">
                        Teacher total{" "}
                        <strong className="text-[#163044]">{humanTotal}</strong>
                      </span>
                      <span className="text-[#6b8190]">
                        AI total{" "}
                        <strong className="text-[#163044]">{aiTotal}</strong>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eeeae3]">
                      <div
                        className="h-full rounded-full bg-[#75afd0] transition-all"
                        style={{
                          width: `${questions.length ? Math.min(100, (markedCount / questions.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    {!isCheckingWorkspace ? (
                      <p className="mt-2 text-[11px] leading-4 text-[#6b8190]">
                        {detail.data?.denominator.note}
                      </p>
                    ) : null}
                    {isCheckingWorkspace ? (
                      isFinalized ? (
                        <div className="mt-2 rounded-lg border border-[#d7eadc] bg-[#f5fbf7] p-2.5">
                          <div className="flex items-center justify-between gap-2 text-[#28734b]">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                              <CheckCircle2 size={15} />
                              PAPER FINALIZED
                            </span>
                            <span className="font-mono text-[11px]">
                              {humanTotal} / {questionMaximumTotal}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] leading-4 text-[#587181]">
                            Final scores are read-only. Use the admin re-check
                            workflow for an approved correction.
                          </p>
                          <button
                            onClick={() => setLocation("/evaluator/papers")}
                            className="press mt-2 w-full rounded-md border border-[#d7eadc] bg-white px-3 py-2 text-xs font-semibold text-[#28734b]"
                          >
                            Back to assigned papers
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2">
                          {remainingFinalMarks ? (
                            <p className="mb-1.5 text-[11px] font-medium text-[#b45309]">
                              {remainingFinalMarks} question
                              {remainingFinalMarks === 1 ? "" : "s"} still need
                              a final mark.
                            </p>
                          ) : hasPendingReview ? (
                            <p className="mb-1.5 text-[11px] font-medium text-[#b45309]">
                              Resolve the remaining review items before
                              finalizing.
                            </p>
                          ) : null}
                          <button
                            onClick={() => submit.mutate({ bundleId })}
                            disabled={
                              submit.isPending ||
                              !questions.length ||
                              remainingFinalMarks > 0 ||
                              hasPendingReview
                            }
                            className="press flex w-full items-center justify-center gap-2 rounded-xl border border-[#d9eaf3] bg-white px-4 py-2.5 text-xs font-semibold text-[#587181] disabled:opacity-40"
                          >
                            {submit.isPending ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={15} />
                            )}
                            {submit.isPending
                              ? "FINALIZING..."
                              : "FINALIZE PAPER"}
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center px-4 text-center">
                  <div className="max-w-sm">
                    <AlertCircle className="mx-auto text-[#b45309]" size={25} />
                    <h3 className="mt-4 font-display text-3xl">
                      {rejectedScheme
                        ? "The previous AI read was rejected."
                        : "No marking setup is attached."}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[#6b8190]">
                      {rejectedScheme
                        ? "An unavailable AI result cannot become a zero-mark question. Restore the official question setup and retry, or continue with manual marking."
                        : detail.data?.bundle.questionPaperKey
                          ? "The question paper is stored. Read its exact questions and maxima before grading."
                          : "Restore or upload the matching question paper before using AI grading."}
                    </p>
                    {detail.data?.bundle.questionPaperKey ? (
                      <button
                        onClick={() => extractScheme.mutate({ bundleId })}
                        disabled={extractScheme.isPending}
                        className="press mx-auto mt-5 flex items-center justify-center gap-2 rounded-full bg-[#163044] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {extractScheme.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Read paper with verified AI
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
          {question ? (
            <section
              className={`${isCheckingWorkspace ? `${evidenceExpanded ? "max-h-[20vh] overflow-y-auto" : "h-[58px] overflow-hidden"} mx-3 mt-2 shrink-0 rounded-xl border border-[#d9eaf3] bg-white px-3 py-2 shadow-sm` : "panel mt-5 rounded-2xl p-5"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono-label text-[#2f6f95]">AI evaluation</p>
                  <p className="mt-1 line-clamp-1 text-xs text-[#587181]">
                    {isCheckingWorkspace
                      ? evaluation?.aiMarks !== null &&
                        evaluation?.aiMarks !== undefined
                        ? "AI ready. View evidence for the rationale."
                        : "Not run. Manual marking is available."
                      : (evaluation?.feedback ??
                        "AI grading is not available yet. Manual grading remains available.")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-[#eaf6fd] px-3 py-1 font-mono text-[10px] text-[#2f6f95]">
                    {evaluation?.aiMarks ?? "-"} / {question.maximumMarks}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[10px] ${evaluation?.requiresHumanReview ? "bg-[#fff3df] text-[#a65c00]" : "bg-[#eaf6fd] text-[#2f6f95]"}`}
                  >
                    {evaluation?.requiresHumanReview
                      ? "REVIEW REQUIRED"
                      : evaluation?.confidence !== null &&
                          evaluation?.confidence !== undefined
                        ? `CONFIDENCE ${evaluation.confidence}%`
                        : "AI NOT RUN"}
                  </span>
                  {isCheckingWorkspace ? (
                    <button
                      onClick={() => setEvidenceExpanded(value => !value)}
                      className="press rounded-lg border border-[#d9eaf3] bg-white px-2.5 py-1.5 text-xs font-medium text-[#2f6f95]"
                    >
                      {evidenceExpanded ? "Hide evidence" : "View evidence"}
                    </button>
                  ) : null}
                </div>
              </div>
              {!isCheckingWorkspace || evidenceExpanded ? (
                <div className="mt-3 grid gap-5 lg:grid-cols-[1.1fr_.9fr_1fr]">
                  <div>
                    <p className="mono-label text-[#7f9aaa]">Answer evidence</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#587181]">
                      {extraction?.status === "completed"
                        ? extraction.structuredText
                        : extraction?.status === "processing"
                          ? "AI is reading the answer sheet."
                          : "No normalized answer evidence is available yet."}
                    </p>
                    {extraction?.status === "completed" ? (
                      <p
                        className={`mt-3 font-mono text-[10px] ${extraction.confidence < 70 ? "text-[#b45309]" : "text-[#2f7898]"}`}
                      >
                        QUESTION MAPPING {extraction.confidence}%{" "}
                        {extraction.confidence < 70
                          ? "· REVIEW BOUNDARY"
                          : "· LABEL MATCHED"}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="mono-label text-[#7f9aaa]">Why this mark</p>
                    <p className="mt-2 text-sm leading-6 text-[#587181]">
                      {evaluation?.feedback ??
                        "AI grading is not available yet. Manual grading remains available."}
                    </p>
                    <p className="mt-3 flex items-center gap-2 text-xs text-[#6b8190]">
                      <MessageSquareText size={14} />
                      AI output is advisory. The teacher's saved mark is
                      authoritative.
                    </p>
                  </div>
                  <div>
                    <p className="mono-label text-[#7f9aaa]">Rubric evidence</p>
                    {aiCriteria.length ? (
                      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#587181]">
                        {aiCriteria.slice(0, 3).map(criterion => (
                          <li
                            key={criterion.criterionId}
                            className="flex gap-2"
                          >
                            <span
                              className={
                                criterion.status === "satisfied"
                                  ? "text-[#2f7898]"
                                  : criterion.status === "partial"
                                    ? "text-[#b45309]"
                                    : criterion.status === "not_applicable"
                                      ? "text-[#6b8190]"
                                      : "text-[#b64c40]"
                              }
                            >
                              {criterion.status === "satisfied"
                                ? "OK"
                                : criterion.status === "partial"
                                  ? "PART"
                                  : criterion.status === "incorrect"
                                    ? "INCORRECT"
                                    : criterion.status === "not_applicable"
                                      ? "N/A"
                                      : "MISS"}
                            </span>
                            <span className="min-w-0 flex-1">
                              {criterion.evidence}
                            </span>
                            {criterion.score !== undefined &&
                            criterion.maximumScore !== undefined ? (
                              <span className="shrink-0 font-mono text-[#2f6f95]">
                                {criterion.score}/{criterion.maximumScore}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-[#6b8190]">
                        Criteria appear after a completed AI evaluation.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
