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
import { useRef, useState } from "react";
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
      <p className="mono-label text-[#78716c]">{label}</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`press mt-2 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center ${file ? "border-[#b8dec4] bg-[#f6fcf8]" : "border-[#d8d2c9] bg-[#fdfcfb] hover:border-[#e6c075]"}`}
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
            <FileCheck2 size={20} className="text-[#16803d]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#78716c]">
              {(file.size / 1024 / 1024).toFixed(1)} MB · ready
            </p>
          </>
        ) : (
          <>
            <UploadCloud size={20} className="text-[#7c5e10]" />
            <p className="mt-2 text-sm font-medium">Select PDF</p>
            <p className="mt-1 text-xs text-[#78716c]">{hint}</p>
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
      <p className="mono-label text-[#78716c]">Question paper</p>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`press mt-2 flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center ${file ? "border-[#b8dec4] bg-[#f6fcf8]" : "border-[#d8d2c9] bg-[#fdfcfb] hover:border-[#e6c075]"}`}
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
            <UploadCloud size={20} className="text-[#7c5e10]" />
            <p className="mt-2 text-sm font-medium">Select PDF</p>
            <p className="mt-1 text-xs text-[#78716c]">
              PDF · questions and marks are read automatically
            </p>
          </>
        ) : extracting ? (
          <>
            <Loader2 size={20} className="animate-spin text-[#7c5e10]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#78716c]">
              Reading questions and marks...
            </p>
          </>
        ) : result ? (
          <>
            <FileCheck2 size={20} className="text-[#16803d]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#78716c]">
              {result.questionCount} question
              {result.questionCount === 1 ? "" : "s"} · {result.maximumMarks}{" "}
              marks extracted
            </p>
          </>
        ) : (
          <>
            <FileCheck2 size={20} className="text-[#16803d]" />
            <p className="mt-2 text-sm font-medium">{file.name}</p>
            <p className="mt-1 text-xs text-[#78716c]">
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
          <p className="text-xs leading-5 text-[#7c5e10]">
            Printed paper total ({result!.printedMaximumMarks}) doesn't match
            the {capturedTotal}-mark scheme that was captured. Review the
            extracted questions in Teacher setup before proceeding.
          </p>
        </div>
      )}
    </div>
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
          <p className="mono-label text-[#7c5e10]">
            01 · Intake & clarity gate
          </p>
          <h1 className="mt-2 font-display text-5xl">
            Upload and check the booklet.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#78716c]">
            Add the question paper and answer booklet. Drishti checks every
            answer page and clearly flags any scan that needs replacing.
          </p>
        </div>
        <div className="rounded-full border border-[#e7e4df] bg-white px-4 py-2">
          <span className="mono-label text-[#78716c]">
            {progress.total
              ? `Batch ${progress.done}/${progress.total}`
              : "Awaiting booklet"}
          </span>
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7f1e3] text-[#7c5e10]">
              <FileUp size={18} />
            </span>
            <div>
              <h2 className="font-semibold">Bundle details</h2>
              <p className="text-xs text-[#78716c]">
                Source documents are retained as discrete artifacts.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            <label>
              <span className="mono-label text-[#78716c]">
                Candidate record
              </span>
              <input
                value={candidateName}
                onChange={event => setCandidateName(event.target.value)}
                placeholder="Candidate name or anonymised ID"
                className="mt-2 h-11 w-full rounded-xl border border-[#e7e4df] bg-[#fdfcfb] px-3 text-sm outline-none focus:border-[#e6c075]"
              />
            </label>
            <label>
              <span className="mono-label text-[#78716c]">Subject</span>
              <input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#e7e4df] bg-[#fdfcfb] px-3 text-sm outline-none focus:border-[#e6c075]"
              />
            </label>
            <label>
              <span className="mono-label text-[#78716c]">
                Question and marks setup
              </span>
              <select
                value={schemeId}
                onChange={event => setSchemeId(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#e7e4df] bg-[#fdfcfb] px-3 text-sm outline-none focus:border-[#e6c075]"
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
              <p className="mt-1 text-xs text-[#78716c]">
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
            className="press mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1c1917] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
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
              <p className="mono-label text-[#7c5e10]">Clarity inspection</p>
              <h2 className="mt-2 font-display text-3xl">
                Every page, visibly checked.
              </h2>
            </div>
            {busy && <Loader2 className="animate-spin text-[#7c5e10]" />}
          </div>
          {!pages.length ? (
            <div className="mt-6 grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#ded8cf] bg-[#fdfcfb] p-6 text-center">
              <div>
                <Sparkles className="mx-auto text-[#c5a45c]" />
                <p className="mt-4 text-sm font-medium">No page readings yet</p>
                <p className="mt-2 max-w-xs text-xs leading-5 text-[#78716c]">
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
                    className="overflow-hidden rounded-2xl border border-[#ece8df] bg-[#fdfcfb]"
                  >
                    <img
                      src={replacement?.dataUrl ?? card.previewUrl}
                      alt={`Rendered booklet page ${page.pageNumber}`}
                      className="h-44 w-full bg-[#f3f1ec] object-contain"
                    />
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#78716c]">
                          PAGE {String(page.pageNumber).padStart(2, "0")}
                        </span>
                        <span
                          className={`ml-auto rounded-full px-2 py-1 mono-label ${actual.clarity === "CLEAR" ? "bg-[#dff5e7] text-[#16803d]" : "bg-[#fae2df] text-[#c0392b]"}`}
                        >
                          {actual.clarity}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[#78716c]">
                        Variance {actual.laplacianVariance} · {actual.reason}
                      </p>
                      {page.clarity === "BLURRY" && (
                        <label className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#e7e4df] bg-white px-3 py-1.5 text-xs font-medium">
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
              <p className="text-xs leading-5 text-[#7c5e10]">
                A <strong>BLURRY</strong> label is never hidden. Every flagged
                page must be replaced with a CLEAR scan before the QR-stamped
                final.pdf is produced.
              </p>
            </div>
            <p className="mt-3 border-t border-[#eadcae] pt-3 text-xs leading-5 text-[#7c5e10]">
              <strong>Calibration note.</strong> This is a deterministic
              variance-of-Laplacian gate, not a proprietary vision model trained
              on your uploads. Before changing the threshold, validate it
              against a labelled set of at least 50 representative CLEAR and
              BLURRY scans and review false labels with a moderator.
            </p>
          </div>
          {bundleId && (
            <button
              type="button"
              disabled={finalize.isPending || Boolean(verificationUrl)}
              onClick={finalizeBundle}
              className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7c5e10] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              className="press mt-3 flex w-full items-center justify-center rounded-xl border border-[#d9c68f] bg-[#fffbf0] px-4 py-3 text-sm font-semibold text-[#7c5e10]"
            >
              Open verification record
            </a>
          )}
        </section>
      </div>
    </div>
  );
}
