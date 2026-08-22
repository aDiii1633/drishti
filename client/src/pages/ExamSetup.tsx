import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import {
  Check,
  Copy,
  Download,
  Play,
  Plus,
  Printer,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type DraftQuestion = {
  id: string;
  label: string;
  maximumMarks: number;
  questionType: "short_answer" | "long_answer" | "objective" | "practical" | "other";
  section: string;
  keywords: string;
  keyPoints: string;
};

function draftQuestion(index: number): DraftQuestion {
  return {
    id: `Q${index}`,
    label: "",
    maximumMarks: 1,
    questionType: "short_answer",
    section: "",
    keywords: "",
    keyPoints: "",
  };
}

export default function ExamSetup() {
  const sessions = trpc.exam.sessions.useQuery(undefined, { refetchInterval: 5_000 });
  const papers = trpc.exam.papers.useQuery(undefined, { refetchInterval: 5_000 });
  const schemes = trpc.schemes.list.useQuery(undefined, { refetchInterval: 5_000 });
  const [sessionForm, setSessionForm] = useState({
    name: "",
    code: "",
    centerName: "",
    recheckOpenUntil: "",
  });
  const [paperForm, setPaperForm] = useState({
    examSessionId: "",
    subject: "",
    subjectCode: "",
    paperCode: "",
    title: "",
    maximumMarks: 80,
    schemeId: "",
    className: "",
    setNumber: "",
    bundleLabel: "",
    expectedQuestionCount: 1,
    qrExpiresAt: "",
  });
  const [useSavedScheme, setUseSavedScheme] = useState(false);
  const [paperQuestions, setPaperQuestions] = useState<DraftQuestion[]>([draftQuestion(1)]);
  const [selected, setSelected] = useState<{
    token: string;
    title: string;
  } | null>(null);
  const [qrImage, setQrImage] = useState("");
  const createSession = trpc.exam.createSession.useMutation({
    onSuccess: () => {
      toast.success("Exam session created.");
      setSessionForm({
        name: "",
        code: "",
        centerName: "",
        recheckOpenUntil: "",
      });
      sessions.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.exam.setSessionStatus.useMutation({
    onSuccess: () => sessions.refetch(),
    onError: error => toast.error(error.message),
  });
  const setRecheckStatus = trpc.exam.setRecheckStatus.useMutation({
    onSuccess: () => sessions.refetch(),
    onError: error => toast.error(error.message),
  });
  const createPaper = trpc.exam.createPaper.useMutation({
    onSuccess: result => {
      toast.success("Paper bundle and intake QR created.");
      setSelected({ token: result.qrPayload, title: paperForm.title });
      setPaperForm(current => ({
        ...current,
        subject: "",
        subjectCode: "",
        paperCode: "",
        title: "",
      }));
      papers.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const createScheme = trpc.schemes.create.useMutation({
    onError: error => toast.error(error.message),
  });

  const questionMarks = useMemo(
    () => paperQuestions.reduce((total, question) => total + Number(question.maximumMarks || 0), 0),
    [paperQuestions],
  );
  const updateQuestion = (index: number, patch: Partial<DraftQuestion>) =>
    setPaperQuestions(current =>
      current.map((question, currentIndex) =>
        currentIndex === index ? { ...question, ...patch } : question,
      ),
    );

  useEffect(() => {
    if (useSavedScheme) return;
    setPaperQuestions(current => {
      const expected = Math.max(1, paperForm.expectedQuestionCount);
      if (current.length === expected) return current;
      if (current.length > expected) return current.slice(0, expected);
      return [...current, ...Array.from({ length: expected - current.length }, (_, index) => draftQuestion(current.length + index + 1))];
    });
  }, [paperForm.expectedQuestionCount, useSavedScheme]);

  useEffect(() => {
    if (!selected) {
      setQrImage("");
      return;
    }
    QRCode.toDataURL(selected.token, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrImage)
      .catch(() => setQrImage(""));
  }, [selected]);

  const submitSession = (event: React.FormEvent) => {
    event.preventDefault();
    createSession.mutate({
      ...sessionForm,
      recheckOpenUntil: sessionForm.recheckOpenUntil
        ? new Date(sessionForm.recheckOpenUntil).toISOString()
        : null,
    });
  };

  const submitPaper = (event: React.FormEvent) => {
    event.preventDefault();
    if (!paperForm.examSessionId)
      return toast.error("Choose an exam session first.");
    const createRegisteredPaper = (schemeId: string) => createPaper.mutate({
      ...paperForm,
      schemeId,
      qrExpiresAt: paperForm.qrExpiresAt ? new Date(paperForm.qrExpiresAt).toISOString() : null,
    });
    if (useSavedScheme) {
      if (!paperForm.schemeId)
        return toast.error("Choose the published question setup for this paper.");
      createRegisteredPaper(paperForm.schemeId);
      return;
    }
    if (paperQuestions.length !== paperForm.expectedQuestionCount)
      return toast.error("Question count must match the paper configuration.");
    if (questionMarks !== paperForm.maximumMarks)
      return toast.error(`Question marks total ${questionMarks}; set the paper total to the same value before generating a QR.`);
    if (paperQuestions.some(question => !question.id.trim() || !question.label.trim() || !question.keyPoints.trim()))
      return toast.error("Every question needs a number, full text, and scoring criteria.");
    createScheme.mutate({
      title: paperForm.title.trim() || `${paperForm.subject.trim()} question set`,
      subject: paperForm.subject,
      maximumMarks: paperForm.maximumMarks,
      questions: paperQuestions.map((question, index) => {
        const keyPoints = question.keyPoints.split("\n").map(value => value.trim()).filter(Boolean);
        return {
          id: question.id,
          questionNumber: question.id,
          label: question.label,
          questionText: question.label,
          maximumMarks: Number(question.maximumMarks),
          order: index + 1,
          questionType: question.questionType,
          section: question.section || undefined,
          keywords: question.keywords.split(",").map(value => value.trim()).filter(Boolean),
          keyPoints,
          requiredConcepts: keyPoints,
        };
      }),
    }, {
      onSuccess: result => {
        schemes.refetch();
        createRegisteredPaper(result.id);
      },
    });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <p className="mono-label text-[#2f6f95]">Examination control</p>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mt-2 font-display text-5xl">
            Sessions and paper bundles.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
            Open a center session, register each subject paper, and print its
            intake QR before sheets reach the scanner.
          </p>
        </div>
        <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 mono-label text-[#2f6f95]">
          QR-first ingestion
        </span>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[.82fr_1.18fr]">
        <section className="space-y-6">
          <form onSubmit={submitSession} className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">1 · Create session</p>
            <h2 className="mt-2 font-display text-3xl">Center / CBSE exam</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input
                aria-label="Exam name"
                required
                placeholder="Exam name"
                value={sessionForm.name}
                onChange={e =>
                  setSessionForm({ ...sessionForm, name: e.target.value })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                aria-label="Session code"
                required
                placeholder="Session code"
                value={sessionForm.code}
                onChange={e =>
                  setSessionForm({
                    ...sessionForm,
                    code: e.target.value.toUpperCase(),
                  })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                aria-label="Center name"
                required
                placeholder="Center name"
                value={sessionForm.centerName}
                onChange={e =>
                  setSessionForm({ ...sessionForm, centerName: e.target.value })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm sm:col-span-2"
              />
              <label className="sm:col-span-2">
                <span className="mono-label text-[#6b8190]">
                  Re-check window closes
                </span>
                <input
                  type="datetime-local"
                  value={sessionForm.recheckOpenUntil}
                  onChange={e =>
                    setSessionForm({
                      ...sessionForm,
                      recheckOpenUntil: e.target.value,
                    })
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
                />
              </label>
            </div>
            <button
              disabled={createSession.isPending}
              className="mt-5 flex items-center gap-2 rounded-xl bg-[#163044] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} /> Create exam session
            </button>
          </form>

          <section className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">Open sessions</p>
            <div className="mt-4 space-y-3">
              {sessions.data?.map(session => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-[#d9eaf3] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{session.name}</p>
                      <p className="mt-1 mono-label text-[#7f9aaa]">
                        {session.code} · {session.centerName}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eaf6fd] px-2.5 py-1 mono-label text-[#2f6f95]">
                      {session.status}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {session.status !== "open" && (
                      <button
                        onClick={() =>
                          setStatus.mutate({ id: session.id, status: "open" })
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-[#d9eaf3] px-3 py-2 text-xs font-semibold"
                      >
                        <Play size={13} /> Open
                      </button>
                    )}
                    {session.status === "open" && (
                      <button
                        onClick={() =>
                          setStatus.mutate({ id: session.id, status: "closed" })
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-[#d9eaf3] px-3 py-2 text-xs font-semibold"
                      >
                        <Square size={13} /> Close
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setRecheckStatus.mutate({
                          id: session.id,
                          recheckStatus:
                            session.recheckStatus === "open" ? "closed" : "open",
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-[#d9eaf3] px-3 py-2 text-xs font-semibold"
                    >
                      {session.recheckStatus === "open"
                        ? "Close re-check"
                        : "Open re-check"}
                    </button>
                    <button
                      onClick={() =>
                        setPaperForm(current => ({
                          ...current,
                          examSessionId: session.id,
                        }))
                      }
                      className="rounded-lg bg-[#eaf6fd] px-3 py-2 text-xs font-semibold text-[#2f6f95]"
                    >
                      Use for paper
                    </button>
                  </div>
                  <p className="mt-3 mono-label text-[#7f9aaa]">
                    Re-check session: {session.recheckStatus}
                  </p>
                </div>
              ))}
              {!sessions.data?.length && (
                <p className="text-sm text-[#6b8190]">
                  Create a session before registering a paper.
                </p>
              )}
            </div>
          </section>
        </section>

        <section className="space-y-6">
          <form onSubmit={submitPaper} className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">2 · Create paper bundle</p>
            <h2 className="mt-2 font-display text-3xl">
              Subject and paper identity
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <select
                required
                value={paperForm.examSessionId}
                onChange={e =>
                  setPaperForm({ ...paperForm, examSessionId: e.target.value })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm sm:col-span-2"
              >
                <option value="">Choose an exam session</option>
                {sessions.data?.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.name} · {session.code}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Subject"
                value={paperForm.subject}
                onChange={e =>
                  setPaperForm({ ...paperForm, subject: e.target.value })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Subject code"
                value={paperForm.subjectCode}
                onChange={e =>
                  setPaperForm({
                    ...paperForm,
                    subjectCode: e.target.value.toUpperCase(),
                  })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Paper code"
                value={paperForm.paperCode}
                onChange={e =>
                  setPaperForm({
                    ...paperForm,
                    paperCode: e.target.value.toUpperCase(),
                  })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Paper title"
                value={paperForm.title}
                onChange={e =>
                  setPaperForm({ ...paperForm, title: e.target.value })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Class / grade"
                value={paperForm.className}
                onChange={e => setPaperForm({ ...paperForm, className: e.target.value })}
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Set number"
                value={paperForm.setNumber}
                onChange={e => setPaperForm({ ...paperForm, setNumber: e.target.value })}
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                placeholder="Bundle label"
                value={paperForm.bundleLabel}
                onChange={e => setPaperForm({ ...paperForm, bundleLabel: e.target.value })}
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                type="number"
                min={1}
                placeholder="Expected questions"
                value={paperForm.expectedQuestionCount}
                onChange={e => setPaperForm({ ...paperForm, expectedQuestionCount: Number(e.target.value) })}
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <input
                required
                type="number"
                min={1}
                placeholder="Maximum marks"
                value={paperForm.maximumMarks}
                onChange={e =>
                  setPaperForm({
                    ...paperForm,
                    maximumMarks: Number(e.target.value),
                  })
                }
                className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm"
              />
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#d9eaf3] py-4">
                  <div>
                    <p className="text-sm font-semibold">Question configuration</p>
                    <p className="mt-1 text-xs text-[#6b8190]">The QR is created only after this exact scoring setup has been saved.</p>
                  </div>
                  <div className="inline-flex rounded-lg border border-[#d9eaf3] bg-white p-1 text-xs font-semibold">
                    <button type="button" onClick={() => setUseSavedScheme(false)} className={`rounded-md px-3 py-2 ${!useSavedScheme ? "bg-[#163044] text-white" : "text-[#587181]"}`}>Build for this paper</button>
                    <button type="button" onClick={() => setUseSavedScheme(true)} className={`rounded-md px-3 py-2 ${useSavedScheme ? "bg-[#163044] text-white" : "text-[#587181]"}`}>Use published setup</button>
                  </div>
                </div>

                {useSavedScheme ? (
                  <select
                    required
                    value={paperForm.schemeId}
                    onChange={e => {
                      const scheme = schemes.data?.find(item => item.id === e.target.value);
                      setPaperForm({ ...paperForm, schemeId: e.target.value, maximumMarks: scheme?.maximumMarks ?? paperForm.maximumMarks, expectedQuestionCount: Array.isArray(scheme?.questions) ? scheme.questions.length : paperForm.expectedQuestionCount });
                    }}
                    className="mt-4 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
                  >
                    <option value="">{schemes.isLoading ? "Loading published setups..." : "Choose published question setup"}</option>
                    {schemes.data?.map(scheme => (
                      <option key={scheme.id} value={scheme.id}>{scheme.title} · {Array.isArray(scheme.questions) ? scheme.questions.length : 0} questions · {scheme.maximumMarks} marks</option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8fcff] px-3 py-2 text-xs">
                      <span className="font-semibold text-[#2f6f95]">{paperQuestions.length} questions configured</span>
                      <span className={questionMarks === paperForm.maximumMarks ? "font-semibold text-[#28734b]" : "font-semibold text-[#b45309]"}>{questionMarks} / {paperForm.maximumMarks} marks</span>
                    </div>
                    {paperQuestions.map((question, index) => (
                      <div key={`${question.id}-${index}`} className="rounded-xl border border-[#d9eaf3] bg-[#f8fcff] p-4">
                        <div className="grid gap-2 sm:grid-cols-[.45fr_.8fr_.7fr_.42fr_auto]">
                          <input value={question.id} onChange={event => updateQuestion(index, { id: event.target.value })} aria-label={`Question ${index + 1} number`} placeholder="Q1" className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm" />
                          <select value={question.questionType} onChange={event => updateQuestion(index, { questionType: event.target.value as DraftQuestion["questionType"] })} aria-label={`Question ${index + 1} type`} className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-xs"><option value="short_answer">Short answer</option><option value="long_answer">Long answer</option><option value="objective">Objective</option><option value="practical">Practical</option><option value="other">Other</option></select>
                          <input value={question.section} onChange={event => updateQuestion(index, { section: event.target.value })} aria-label={`Question ${index + 1} section`} placeholder="Section (optional)" className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm" />
                          <input type="number" min={1} value={question.maximumMarks} onChange={event => updateQuestion(index, { maximumMarks: Number(event.target.value) })} aria-label={`Question ${index + 1} maximum marks`} className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm" />
                          <button type="button" title="Remove question" aria-label="Remove question" disabled={paperQuestions.length === 1} onClick={() => setPaperQuestions(current => current.filter((_, currentIndex) => currentIndex !== index))} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d9eaf3] bg-white text-[#b64c40] disabled:opacity-30"><Trash2 size={15} /></button>
                        </div>
                        <textarea value={question.label} onChange={event => updateQuestion(index, { label: event.target.value })} aria-label={`Question ${index + 1} text`} placeholder="Full question text" className="mt-2 min-h-16 w-full rounded-lg border border-[#d9eaf3] bg-white p-2 text-sm" />
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <textarea value={question.keyPoints} onChange={event => updateQuestion(index, { keyPoints: event.target.value })} aria-label={`Question ${index + 1} scoring criteria`} placeholder="Required concepts / scoring criteria, one per line" className="min-h-16 w-full rounded-lg border border-[#d9eaf3] bg-white p-2 text-xs" />
                          <input value={question.keywords} onChange={event => updateQuestion(index, { keywords: event.target.value })} aria-label={`Question ${index + 1} keywords`} placeholder="Keywords, comma separated" className="h-10 self-start rounded-lg border border-[#d9eaf3] bg-white px-2 text-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className="text-xs text-[#6b8190]">
                QR expiry (optional)
                <input
                  type="datetime-local"
                  value={paperForm.qrExpiresAt}
                  onChange={e => setPaperForm({ ...paperForm, qrExpiresAt: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
                />
              </label>
            </div>
            <button
              disabled={createPaper.isPending || createScheme.isPending || (useSavedScheme ? !paperForm.schemeId : questionMarks !== paperForm.maximumMarks)}
              className="mt-5 flex items-center gap-2 rounded-xl bg-[#2f6f95] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Check size={16} /> Generate intake QR
            </button>
          </form>

          <section className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">3 · Registered papers</p>
            <div className="mt-4 space-y-3">
              {papers.data?.map(paper => (
                <button
                  key={paper.id}
                  onClick={() =>
                    setSelected({
                      token: "DRISHTI-INTAKE:" + paper.qrToken,
                      title: paper.title,
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#d9eaf3] p-4 text-left hover:border-[#8fc7e8]"
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {paper.title}
                    </span>
                    <span className="mt-1 block mono-label text-[#7f9aaa]">
                      {paper.subject} · {paper.subjectCode} · {paper.paperCode}
                    </span>
                  </span>
                  <span className="rounded-full bg-[#eaf6fd] px-2.5 py-1 mono-label text-[#2f6f95]">
                    {paper.status}
                  </span>
                </button>
              ))}
              {!papers.data?.length && (
                <p className="text-sm text-[#6b8190]">
                  Registered paper bundles will appear here.
                </p>
              )}
            </div>
          </section>

          {selected && (
            <section className="panel rounded-3xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono-label text-[#2f6f95]">
                    Printable intake label
                  </p>
                  <h2 className="mt-2 font-display text-3xl">
                    {selected.title}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    title="Copy QR payload"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(selected.token)
                        .then(() => toast.success("QR payload copied."))
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3]"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    title="Print QR"
                    onClick={() => window.print()}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#d9eaf3]"
                  >
                    <Printer size={15} />
                  </button>
                </div>
              </div>
              {qrImage && (
                <img
                  src={qrImage}
                  alt="Intake QR code"
                  className="mx-auto mt-5 aspect-square h-auto w-full max-w-72 bg-white object-contain"
                />
              )}
              <p className="mt-3 break-all text-center font-mono text-[10px] text-[#6b8190]">
                {selected.token}
              </p>
              {qrImage && (
                <a
                  download="drishti-intake-qr.png"
                  href={qrImage}
                  className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-lg bg-[#eaf6fd] px-3 py-2 text-xs font-semibold text-[#2f6f95]"
                >
                  <Download size={14} /> Download QR
                </a>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
