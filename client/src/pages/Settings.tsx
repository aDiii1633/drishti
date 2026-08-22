import { trpc } from "@/lib/trpc";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CBSE_CLASS_XII_CORE_SUBJECTS } from "@/lib/cbse";
import { questionMarksTotal } from "@/lib/teacherSetup";

type DraftQuestion = {
  id: string;
  label: string;
  maximumMarks: number;
  keyPoints: string;
};
const initial = [
  { id: "Q1", label: "Question 1", maximumMarks: 5, keyPoints: "" },
];

export default function Settings() {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("CBSE examination");
  const [maximum, setMaximum] = useState(80);
  const [questions, setQuestions] = useState<DraftQuestion[]>(initial);
  const schemes = trpc.schemes.list.useQuery();
  const create = trpc.schemes.create.useMutation({
    onSuccess: () => {
      toast.success("Question setup saved.");
      schemes.refetch();
      setTitle("");
      setQuestions(initial);
    },
  });
  const used = questionMarksTotal(questions);
  const update = (index: number, patch: Partial<DraftQuestion>) =>
    setQuestions(current =>
      current.map((question, currentIndex) =>
        currentIndex === index ? { ...question, ...patch } : question
      )
    );
  const submit = () => {
    if (!title.trim()) return toast.error("Give this paper setup a name.");
    if (used !== maximum)
      return toast.error(`Question marks must total exactly ${maximum} before this setup can be published.`);
    if (questions.some(question => !question.id.trim() || !question.label.trim() || !question.keyPoints.trim()))
      return toast.error("Every question needs a number, full text, and at least one scoring criterion.");
    create.mutate({
      title,
      subject,
      maximumMarks: maximum,
      questions: questions.map(question => ({
        id: question.id,
        label: question.label,
        maximumMarks: Number(question.maximumMarks),
        keyPoints: question.keyPoints
          .split("\n")
          .map(item => item.trim())
          .filter(Boolean),
      })),
    });
  };
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Teacher setup</p>
      <h1 className="mt-2 font-display text-5xl">
        Questions and marks, made simple.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        Add each question and its maximum marks once. Drishti uses these limits
        automatically for teacher entry and AI evaluation, so no score can
        exceed the paper’s rules.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="panel rounded-3xl p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mono-label text-[#6b8190]">Paper name</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm outline-none focus:border-[#8fc7e8]"
                placeholder="e.g. Business Studies term exam"
              />
            </label>
            <label>
              <span className="mono-label text-[#6b8190]">Subject</span>
              <input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm outline-none focus:border-[#8fc7e8]"
              />
            </label>
          </div>
          <label className="mt-4 block max-w-xs">
            <span className="mono-label text-[#6b8190]">Paper total marks</span>
            <input
              type="number"
              min="1"
              value={maximum}
              onChange={event => setMaximum(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm outline-none focus:border-[#8fc7e8]"
            />
          </label>
          <div className="mt-7 flex items-center justify-between">
            <div>
              <p className="mono-label text-[#2f6f95]">Question marks</p>
              <p className="mt-1 text-sm text-[#6b8190]">
                {used} of {maximum} marks allocated
              </p>
            </div>
            <button
              onClick={() =>
                setQuestions(current => [
                  ...current,
                  {
                    id: `Q${current.length + 1}`,
                    label: `Question ${current.length + 1}`,
                    maximumMarks: 1,
                    keyPoints: "",
                  },
                ])
              }
              className="press flex items-center gap-1 rounded-full border border-[#d9eaf3] px-3 py-2 text-xs font-semibold"
            >
              <Plus size={14} />
              Add question
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {questions.map((question, index) => (
              <div
                key={`${question.id}-${index}`}
                className="rounded-2xl border border-[#d9eaf3] bg-[#f8fcff] p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[.45fr_1.4fr_.45fr_auto]">
                  <input
                    value={question.id}
                    onChange={event =>
                      update(index, { id: event.target.value })
                    }
                    className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm"
                    aria-label="Question ID"
                  />
                  <input
                    value={question.label}
                    onChange={event =>
                      update(index, { label: event.target.value })
                    }
                    className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm"
                    aria-label="Question label"
                  />
                  <input
                    type="number"
                    min="1"
                    value={question.maximumMarks}
                    onChange={event =>
                      update(index, {
                        maximumMarks: Number(event.target.value),
                      })
                    }
                    className="h-10 rounded-lg border border-[#d9eaf3] bg-white px-2 text-sm"
                    aria-label="Question maximum"
                  />
                  <button
                    onClick={() =>
                      setQuestions(current =>
                        current.filter(
                          (_, currentIndex) => currentIndex !== index
                        )
                      )
                    }
                    disabled={questions.length === 1}
                    className="press grid h-10 w-10 place-items-center rounded-lg border border-[#d9eaf3] text-[#b64c40] disabled:opacity-30"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <textarea
                  value={question.keyPoints}
                  onChange={event =>
                    update(index, { keyPoints: event.target.value })
                  }
                  className="mt-3 min-h-16 w-full rounded-lg border border-[#d9eaf3] bg-white p-2 text-xs leading-5 outline-none focus:border-[#8fc7e8]"
                  placeholder="Required scoring criteria, one per line"
                />
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={create.isPending || used !== maximum}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163044] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Save size={16} />
            Save question setup
          </button>
        </section>
        <aside className="space-y-6">
          <div className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">Saved papers</p>
            <h2 className="mt-2 font-display text-3xl">Question setups</h2>
            <div className="mt-5 space-y-3">
              {schemes.data?.length ? (
                schemes.data.map(scheme => (
                  <div
                    key={scheme.id}
                    className="rounded-2xl border border-[#d9eaf3] p-4"
                  >
                    <p className="text-sm font-semibold">{scheme.title}</p>
                    <p className="mt-1 mono-label text-[#7f9aaa]">
                      {scheme.subject}
                    </p>
                    <p className="mt-4 font-display text-3xl">
                      {scheme.maximumMarks}
                      <span className="ml-1 text-base text-[#6b8190]">
                        marks
                      </span>
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-[#eef7fc] p-4 text-xs leading-5 text-[#6b8190]">
                  Add the paper’s questions and marks once, then choose the
                  setup during intake.
                </p>
              )}
            </div>
          </div>
          <div className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">
              Official CBSE references
            </p>
            <h2 className="mt-2 font-display text-3xl">
              Verify before you mark.
            </h2>
            <p className="mt-3 text-xs leading-5 text-[#6b8190]">
              Use these official Class XII links to verify the specific
              questions and maxima you enter. They are reference material, not
              an automatic paper-specific answer key.
            </p>
            <div className="mt-4 max-h-[440px] overflow-y-auto rounded-xl border border-[#d9eaf3]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#eef7fc] mono-label text-[#2f6f95]">
                  <tr>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Official material</th>
                  </tr>
                </thead>
                <tbody>
                  {CBSE_CLASS_XII_CORE_SUBJECTS.map(item => (
                    <tr
                      key={item.subject}
                      className="border-t border-[#d9eaf3]"
                    >
                      <td className="p-3 font-medium">{item.subject}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          <a
                            href={item.curriculum}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#2f6f95] underline underline-offset-2"
                          >
                            Curriculum
                          </a>
                          <a
                            href={item.sqp}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#2f6f95] underline underline-offset-2"
                          >
                            SQP
                          </a>
                          <a
                            href={item.marking}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#2f6f95] underline underline-offset-2"
                          >
                            MS
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a
              href="https://cbseacademic.nic.in/sqp_classxii_2025-26.html"
              target="_blank"
              rel="noreferrer"
              className="press mt-3 block rounded-xl border border-[#d9eaf3] bg-[#f8fcff] px-3 py-2 text-center text-xs font-semibold hover:border-[#8fc7e8]"
            >
              Open full official Class XII list
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
