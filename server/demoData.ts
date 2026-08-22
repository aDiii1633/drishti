import { and, eq, or } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { nanoid } from "nanoid";
import {
  answerExtractions,
  auditEvents,
  bundleAssignments,
  bundles,
  clarityCalibrationSamples,
  documents,
  deviations,
  evaluations,
  evaluatorProfiles,
  examPapers,
  examSessions,
  generations,
  markingSchemes,
  pageChecks,
  recheckRequests,
  schools,
  students,
  teacherAnnotations,
  users,
} from "../drizzle/schema";
import type { Bundle } from "../drizzle/schema";
import type { DrishtiRole, SchemeQuestion } from "../shared/drishti";
import { getDb } from "./db";
import { hashPassword } from "./passwordAuth";
import { INTAKE_QR_SCHEMA_VERSION, issueIntakeQr } from "./qrToken";
import { storagePut } from "./storage";
import { isDemoMode } from "./runtimeMode";

export const DEMO_CENTER = "DRISHTI Demonstration Examination Centre";
export const DEMO_SESSION_ID = "demo-session-2026";
export const DEMO_SCHOOL_ID = "demo-school-01";
export const DEMO_PAPER_ID = "demo-paper-mathematics-041";
export const DEMO_SCHEME_ID = "demo-scheme-mathematics-041";
export const DEMO_STUDENT_ID = "demo-student-aarohi";

function demoPassword() {
  const password = process.env.DRISHTI_DEMO_PASSWORD?.trim();
  if (!password) {
    throw new Error(
      "DRISHTI_DEMO_PASSWORD must be set before demo data can be seeded."
    );
  }
  return password;
}

type DemoAccount = {
  email: string;
  name: string;
  role: DrishtiRole;
  openId: string;
  schoolId?: string | null;
};

type SchoolBlueprint = {
  id: string;
  name: string;
  code: string;
  location: string;
};

type PaperBlueprint = {
  id: string;
  schemeId: string;
  subject: string;
  subjectCode: string;
  paperCode: string;
  title: string;
  setNumber: string;
  maximumMarks: number;
  qrStatus: "active" | "revoked" | "expired";
  questions: SchemeQuestion[];
};

type SeededUser = Awaited<ReturnType<typeof seedUser>>;

const schoolBlueprints: SchoolBlueprint[] = [
  { id: "demo-school-01", name: "Delhi Public School - Demo", code: "DPS-DEMO-01", location: "New Delhi" },
  { id: "demo-school-02", name: "Kendriya Vidyalaya - Demo", code: "KV-DEMO-02", location: "Lucknow" },
  { id: "demo-school-03", name: "St. Xavier's School - Demo", code: "SXS-DEMO-03", location: "Jaipur" },
  { id: "demo-school-04", name: "Modern Public School - Demo", code: "MPS-DEMO-04", location: "Chandigarh" },
  { id: "demo-school-05", name: "Sunrise Senior Secondary - Demo", code: "SSS-DEMO-05", location: "Bhopal" },
];

const paperBlueprints: PaperBlueprint[] = [
  {
    id: DEMO_PAPER_ID,
    schemeId: DEMO_SCHEME_ID,
    subject: "Mathematics",
    subjectCode: "041",
    paperCode: "MAT-041",
    title: "Mathematics Theory",
    setNumber: "A",
    maximumMarks: 20,
    qrStatus: "active",
    questions: [
      { id: "Q1", label: "Differentiate f(x) = 3x^2 - 4x + 7.", maximumMarks: 4, keyPoints: ["power rule", "6x - 4", "constant differentiates to zero"] },
      { id: "math-q2", label: "Solve x^2 - 5x + 6 = 0 and show the method.", maximumMarks: 5, keyPoints: ["factorisation", "roots 2 and 3", "valid working"] },
      { id: "math-q3", label: "Evaluate the definite integral from 0 to 2 of (2x + 1) dx.", maximumMarks: 5, keyPoints: ["antiderivative x squared plus x", "substitute both limits", "final value 6"] },
      { id: "math-q4", label: "Find the equation of the line through (2, 3) with slope 4.", maximumMarks: 6, keyPoints: ["point-slope form", "substitution", "simplified equation"] },
    ],
  },
  {
    id: "demo-paper-physics-042",
    schemeId: "demo-scheme-physics-042",
    subject: "Physics",
    subjectCode: "042",
    paperCode: "PHY-042",
    title: "Physics Theory",
    setNumber: "B",
    maximumMarks: 20,
    qrStatus: "active",
    questions: [
      { id: "physics-q1", label: "State Newton's second law and give its vector form.", maximumMarks: 4, keyPoints: ["rate of change of momentum", "F equals ma", "direction"] },
      { id: "physics-q2", label: "Explain the working principle of a transformer.", maximumMarks: 5, keyPoints: ["mutual induction", "alternating current", "turns ratio"] },
      { id: "physics-q3", label: "Derive the expression for kinetic energy.", maximumMarks: 5, keyPoints: ["work-energy theorem", "substitution of v squared minus u squared", "one half mv squared"] },
      { id: "physics-q4", label: "Describe two applications of total internal reflection.", maximumMarks: 6, keyPoints: ["critical angle", "optical fibre", "valid second application"] },
    ],
  },
  {
    id: "demo-paper-english-301",
    schemeId: "demo-scheme-english-301",
    subject: "English",
    subjectCode: "301",
    paperCode: "ENG-301",
    title: "English Core",
    setNumber: "A",
    maximumMarks: 20,
    qrStatus: "active",
    questions: [
      { id: "english-q1", label: "Write a formal letter requesting a school library improvement.", maximumMarks: 5, keyPoints: ["formal format", "clear request", "appropriate tone"] },
      { id: "english-q2", label: "Summarise the passage in not more than 80 words.", maximumMarks: 5, keyPoints: ["main idea", "relevant details", "concise language"] },
      { id: "english-q3", label: "Explain the central conflict in the prescribed poem.", maximumMarks: 4, keyPoints: ["identify conflict", "textual support", "clear explanation"] },
      { id: "english-q4", label: "Draft a notice for an inter-school science exhibition.", maximumMarks: 6, keyPoints: ["notice format", "date and venue", "complete information"] },
    ],
  },
  {
    id: "demo-paper-computers-083",
    schemeId: "demo-scheme-computers-083",
    subject: "Computer Science",
    subjectCode: "083",
    paperCode: "CS-083",
    title: "Computer Science Theory",
    setNumber: "C",
    maximumMarks: 20,
    qrStatus: "active",
    questions: [
      { id: "cs-q1", label: "Explain the difference between a stack and a queue.", maximumMarks: 4, keyPoints: ["LIFO", "FIFO", "use cases"] },
      { id: "cs-q2", label: "Write an algorithm to search an element in a sorted list.", maximumMarks: 5, keyPoints: ["binary search", "comparison", "termination"] },
      { id: "cs-q3", label: "Describe primary keys and foreign keys in a relational database.", maximumMarks: 5, keyPoints: ["unique identity", "relationship", "referential integrity"] },
      { id: "cs-q4", label: "State three principles of secure password handling.", maximumMarks: 6, keyPoints: ["hashing", "salt", "rate limiting"] },
    ],
  },
  {
    id: "demo-paper-hindi-002",
    schemeId: "demo-scheme-hindi-002",
    subject: "Hindi",
    subjectCode: "002",
    paperCode: "HIN-002",
    title: "Hindi Core",
    setNumber: "D",
    maximumMarks: 20,
    qrStatus: "active",
    questions: [
      { id: "hindi-q1", label: "औपचारिक पत्र के मुख्य अंगों का वर्णन कीजिए।", maximumMarks: 5, keyPoints: ["प्रारूप", "विषय", "शिष्ट भाषा"] },
      { id: "hindi-q2", label: "दिए गए गद्यांश का संक्षेप लिखिए।", maximumMarks: 5, keyPoints: ["मुख्य विचार", "संक्षिप्त भाषा", "संगत विवरण"] },
      { id: "hindi-q3", label: "कविता के भाव और संदेश की व्याख्या कीजिए।", maximumMarks: 4, keyPoints: ["भाव", "संदेश", "उदाहरण"] },
      { id: "hindi-q4", label: "विद्यालयी कार्यक्रम के लिए सूचना लिखिए।", maximumMarks: 6, keyPoints: ["सूचना प्रारूप", "समय और स्थान", "पूर्ण जानकारी"] },
    ],
  },
];

const studentNames = [
  "Aarohi Kapoor", "Vihaan Mehra", "Anaya Sharma", "Kabir Malhotra", "Myra Nair", "Arjun Rao",
  "Ishita Sen", "Reyansh Gupta", "Sara Thomas", "Advik Jain", "Meera Iyer", "Rohan Bhat",
  "Diya Joshi", "Atharv Singh", "Kiara Das", "Yuvan Khanna", "Tara Menon", "Ayaan Verma",
  "Nitya Sood", "Ritvik Bose", "Anvi Kulkarni", "Dhruv Arora", "Ira Chawla", "Neil Dutta",
  "Saanvi Pillai", "Kian Oberoi", "Navya Saxena", "Aditya Roy", "Mahi Kapoor", "Rudra Mishra",
];

const evaluatorNames = [
  ["evaluator.demo@example.com", "Dr. Meenal Rao", "Mathematics"],
  ["evaluator.physics.demo@example.com", "Prof. Arvind Iyer", "Physics"],
  ["evaluator.english.demo@example.com", "Ms. Rhea Thomas", "English"],
  ["evaluator.cs.demo@example.com", "Mr. Nikhil Bansal", "Computer Science"],
  ["evaluator.hindi.demo@example.com", "Dr. Kavita Joshi", "Hindi"],
] as const;

function demoAccounts(): DemoAccount[] {
  return [
    { email: "admin.demo@example.com", name: "Demo Center Administrator", role: "admin", openId: "demo:demo-admin" },
    ...schoolBlueprints.map((school, index) => ({
      email: index === 0 ? "school.demo@example.com" : `school${index + 1}.demo@example.com`,
      name: `${school.name} Administrator`,
      role: "school_admin" as const,
      openId: `demo:demo-school-admin-${index + 1}`,
      schoolId: school.id,
    })),
    { email: "scanner.demo@example.com", name: "Demo Scan Desk", role: "operator", openId: "demo:demo-scanner-01" },
    { email: "scanner.backup.demo@example.com", name: "Demo Backup Scan Desk", role: "operator", openId: "demo:demo-scanner-02" },
    ...evaluatorNames.map(([email, name], index) => ({ email, name, role: "evaluator" as const, openId: `demo:demo-evaluator-${index + 1}` })),
    { email: "student.demo@example.com", name: "Aarohi Kapoor", role: "student", openId: "demo:demo-student" },
  ];
}

export type DemoSeedSummary = {
  enabled: boolean;
  seeded: boolean;
  reason?: string;
  credentials?: { emails: string[] };
  qrPayload?: string;
};

async function seedUser(db: Awaited<ReturnType<typeof getDb>>, account: DemoAccount, passwordHash: string) {
  if (!db) throw new Error("Database unavailable.");
  const existing = (await db.select().from(users).where(or(eq(users.openId, account.openId), eq(users.loginId, account.email))).limit(1))[0];
  const values = {
    openId: account.openId,
    loginId: account.email,
    email: account.email,
    name: account.name,
    role: account.role,
    schoolId: account.schoolId ?? null,
    passwordHash,
    loginMethod: "local-password",
    isDemo: true,
    isActive: true,
    mustChangePassword: false,
  } as const;
  if (existing) {
    // Keep the established password hash. Rehashing the same demo password on
    // every hot restart turns a read-mostly seed into a write storm and can
    // briefly lock the local SQLite database while a browser is using it.
    const updateValues = { ...values, passwordHash: existing.passwordHash ?? passwordHash };
    const needsUpdate =
      existing.openId !== values.openId ||
      existing.loginId !== values.loginId ||
      existing.email !== values.email ||
      existing.name !== values.name ||
      existing.role !== values.role ||
      existing.schoolId !== values.schoolId ||
      existing.loginMethod !== values.loginMethod ||
      existing.isDemo !== values.isDemo ||
      existing.isActive !== values.isActive ||
      existing.mustChangePassword !== values.mustChangePassword ||
      !existing.passwordHash;
    if (needsUpdate)
      await db.update(users).set(updateValues).where(eq(users.id, existing.id));
    return { ...existing, ...updateValues };
  }
  return (await db.insert(users).values(values).returning())[0];
}

async function demoPdf(title: string, lines: string[]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("DRISHTI DEMONSTRATION EXAMINATION", { x: 48, y: 790, size: 15, font, color: rgb(0.1, 0.25, 0.35) });
  const pdfSafe = (value: string) => value.replace(/[^\x20-\x7E]/g, "?");
  page.drawText(pdfSafe(title), { x: 48, y: 755, size: 12, font });
  lines.forEach((line, index) => page.drawText(pdfSafe(line).slice(0, 92), { x: 48, y: 710 - index * 24, size: 10, font }));
  return Buffer.from(await pdf.save());
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function demoAnswerSvg(studentName: string, subject: string, questions: SchemeQuestion[]) {
  const lines = [
    "DRISHTI ANSWER SHEET - SYNTHETIC DEMONSTRATION RECORD",
    `Candidate: ${studentName}`,
    `Subject: ${subject}`,
    ...questions.map((question, index) => `${index + 1}. ${question.label}  Answer: The candidate has provided a structured response covering the required concepts.`),
  ];
  const text = lines.map((line, index) => `<text x="54" y="${58 + index * 34}" font-family="Arial, sans-serif" font-size="${index === 0 ? 18 : 14}" fill="#163044">${escapeXml(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.max(620, 90 + lines.length * 34)}"><rect width="100%" height="100%" fill="#ffffff"/><rect x="24" y="24" width="1152" height="${Math.max(570, 40 + lines.length * 34)}" fill="none" stroke="#9fc9df" stroke-width="2"/><line x1="54" y1="78" x2="1146" y2="78" stroke="#9fc9df"/>${text}</svg>`;
  const encoded = Buffer.from(svg).toString("base64");
  return { bytes: Buffer.from(svg), dataUrl: `data:image/svg+xml;base64,${encoded}` };
}

async function seedCalibrationSamples(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const samples = [
    ["demo-calibration-clear-01", "Demo daylight page", "CLEAR", "CLEAR", 410, "Clean printed text under even light."],
    ["demo-calibration-clear-02", "Demo desk-light page", "CLEAR", "CLEAR", 285, "Readable handwriting with stable focus."],
    ["demo-calibration-clear-03", "Demo high-contrast page", "CLEAR", "CLEAR", 520, "Strong edge response and no crop loss."],
    ["demo-calibration-blurry-01", "Demo motion-blur page", "BLURRY", "BLURRY", 42, "Characters merge along the baseline."],
    ["demo-calibration-blurry-02", "Demo low-light page", "BLURRY", "BLURRY", 68, "Shadow obscures the lower answer region."],
    ["demo-calibration-review-01", "Demo borderline page", "BLURRY", "CLEAR", 112, "Human review accepted the page after inspection."],
  ] as const;
  for (const [id, sourceLabel, expectedClarity, observedClarity, laplacianVariance, reviewerNote] of samples) {
    await db.insert(clarityCalibrationSamples).values({ id, sourceLabel, expectedClarity, observedClarity, laplacianVariance, reviewerNote, createdByRole: "admin" }).onConflictDoUpdate({ target: clarityCalibrationSamples.id, set: { sourceLabel, expectedClarity, observedClarity, laplacianVariance, reviewerNote, createdByRole: "admin" } });
  }
}

async function seedBundle(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: {
    id: string;
    student: typeof students.$inferSelect;
    paper: typeof examPapers.$inferSelect;
    scanner: typeof users.$inferSelect;
    evaluator: typeof users.$inferSelect;
    state: Bundle["processingState"];
    index: number;
  },
) {
  const existing = (await db.select().from(bundles).where(eq(bundles.id, input.id)).limit(1))[0];
  if (existing) return existing;
  const questions = (await db.select().from(markingSchemes).where(eq(markingSchemes.id, input.paper.schemeId!)).limit(1))[0]?.questions as SchemeQuestion[];
  const answer = demoAnswerSvg(input.student.name, input.paper.subject, questions);
  const answerStored = await storagePut(`demo/${input.id}/answer-sheet.svg`, answer.bytes, "image/svg+xml");
  const questionPdf = await demoPdf(`${input.paper.subject} / ${input.paper.paperCode}`, questions.map(question => `${question.id}: ${question.label}`));
  const questionStored = await storagePut(`demo/${input.id}/question-paper.pdf`, questionPdf, "application/pdf");
  const finalStored = input.state === "completed" || input.state === "recheck_required"
    ? await storagePut(`demo/${input.id}/final-result.pdf`, await demoPdf(`${input.paper.subject} - Final Result`, [`Candidate: ${input.student.name}`, "This synthetic result is for local demonstration only."]), "application/pdf")
    : null;
  const completed = ["completed", "finalized", "recheck_required", "submitted"].includes(input.state);
  const status: Bundle["status"] = input.state === "completed" ? "finalized" : input.state === "submitted" ? "moderation" : input.state === "grading" ? "grading" : input.state === "recheck_required" ? "review" : "intake";
  await db.insert(bundles).values({
    id: input.id,
    candidateName: input.student.name,
    candidateId: input.student.candidateId,
    candidateDob: input.student.dateOfBirth,
    studentId: input.student.id,
    schoolId: input.student.schoolId,
    isDemo: true,
    subject: input.paper.subject,
    examPaperId: input.paper.id,
    intakeQrToken: input.paper.qrToken,
    status,
    questionPaperKey: questionStored.key,
    questionPaperUrl: questionStored.url,
    bookletKey: answerStored.key,
    bookletUrl: answerStored.url,
    finalKey: finalStored?.key ?? null,
    finalUrl: finalStored?.url ?? null,
    pageCount: 1,
    printedMaximumMarks: input.paper.maximumMarks,
    operatorConfirmedTotal: input.paper.maximumMarks,
    catalogTotal: input.paper.maximumMarks,
    coverageComplete: completed,
    schemeId: input.paper.schemeId,
    qrToken: input.paper.qrToken,
    createdByRole: "operator",
    createdByUserId: input.scanner.id,
    idempotencyKey: `demo-idempotency-${input.id}`,
    captureSource: input.index % 3 === 0 ? "camera" : input.index % 3 === 1 ? "hardware" : "pdf",
    captureDevice: input.index % 3 === 1 ? "Demo USB QR scanner" : "Demo scan station",
    processingState: input.state,
  });
  await db.insert(documents).values([
    { id: `demo-doc-question-${input.id}`, bundleId: input.id, artifactType: "questionPaper", fileName: `${input.paper.paperCode}-question-paper.pdf`, mimeType: "application/pdf", storageKey: questionStored.key, storageUrl: questionStored.url, pageNumber: null },
    { id: `demo-doc-answer-${input.id}`, bundleId: input.id, artifactType: "answerBooklet", fileName: `${input.student.candidateId}-answer-sheet.svg`, mimeType: "image/svg+xml", storageKey: answerStored.key, storageUrl: answerStored.url, pageNumber: null },
    ...(finalStored ? [{ id: `demo-doc-final-${input.id}`, bundleId: input.id, artifactType: "finalPdf" as const, fileName: `${input.student.candidateId}-final-result.pdf`, mimeType: "application/pdf", storageKey: finalStored.key, storageUrl: finalStored.url, pageNumber: null }] : []),
  ]);
  await db.insert(pageChecks).values({ id: `demo-page-${input.id}`, bundleId: input.id, pageNumber: 1, clarity: "CLEAR", laplacianVariance: 340 + (input.index % 5) * 28, reason: "Synthetic demonstration page passed the clarity gate.", pageDataUrl: answer.dataUrl });
  if (["assigned", "grading", "submitted", "completed", "recheck_required"].includes(input.state)) {
    await db.insert(bundleAssignments).values({ id: `demo-assignment-${input.id}`, bundleId: input.id, evaluatorUserId: input.evaluator.id, assignedByUserId: input.scanner.id });
  }
  await db.insert(auditEvents).values([
    { id: `demo-audit-capture-${input.id}`, bundleId: input.id, actorRole: "operator", eventType: "bundle.captured", detail: `Demo scan captured from ${input.index % 3 === 1 ? "Demo USB QR scanner" : "Demo scan station"}.` },
    { id: `demo-audit-assignment-${input.id}`, bundleId: input.id, actorRole: "admin", eventType: "evaluator.assigned", detail: `Demo paper assigned to ${input.evaluator.name}.` },
  ]);
  if (completed) {
    await db.insert(generations).values({ id: `demo-generation-${input.id}`, bundleId: input.id, provider: "historical-demo", model: "demo-review-model", status: "completed", output: { summary: "Historical demonstration evaluation record.", answerSheet: input.id } });
    for (let questionIndex = 0; questionIndex < questions.length; questionIndex++) {
      const question = questions[questionIndex]!;
      const aiMarks = Math.max(0, question.maximumMarks - ((input.index + questionIndex) % 2));
      const humanMarks = input.index === 4 && questionIndex === 0 ? Math.max(0, aiMarks - 3) : Math.min(question.maximumMarks, aiMarks + (input.index % 3 === 0 ? 1 : 0));
      const evaluationId = `demo-evaluation-${input.id}-${question.id}`;
      await db.insert(evaluations).values({ id: evaluationId, bundleId: input.id, questionId: question.id, questionLabel: question.label, schemeMaximum: question.maximumMarks, humanMarks, aiMarks, feedback: `The response addresses the rubric concepts for ${question.id}.`, confidence: 82 + ((input.index + questionIndex) % 15), aiOutput: { suggestedScore: aiMarks, reason: "Historical synthetic evaluation for workflow demonstration.", criteria: question.keyPoints }, aiProvider: "historical-demo", aiModel: "demo-review-model", aiEvaluatedAt: new Date(Date.now() - (input.index + 1) * 86_400_000), promptVersion: "demo-history-v1", rubricVersion: input.paper.schemeId, requiresHumanReview: humanMarks !== aiMarks, humanDecision: humanMarks === aiMarks ? "accept" : "override", decisionReason: humanMarks === aiMarks ? "Aligned with the AI suggestion." : "Evaluator applied the rubric after reviewing the answer.", teacherComment: humanMarks === aiMarks ? "Clear response." : "Partial reasoning required a manual adjustment.", pagesViewed: [1], reviewedByRole: "evaluator" });
      await db.insert(answerExtractions).values({ id: `demo-extraction-${input.id}-${question.id}`, bundleId: input.id, questionId: question.id, pageNumber: 1, rawText: "Synthetic answer text for the historical demonstration record.", structuredText: `The candidate response covers: ${question.keyPoints.join(", ")}.`, language: "en-IN", confidence: 88, answerRegion: { x: 0.08, y: 0.18, width: 0.84, height: 0.26 }, status: "completed", provider: "historical-demo" });
      if (input.index === 4 && questionIndex === 0) await db.insert(deviations).values({ id: `demo-deviation-${input.id}-${question.id}`, bundleId: input.id, evaluationId, delta: Math.abs(humanMarks - aiMarks), status: "open" });
    }
    await db.insert(auditEvents).values({ id: `demo-audit-evaluation-${input.id}`, bundleId: input.id, actorRole: "evaluator", eventType: "marking.submitted", detail: "Historical demonstration evaluation was submitted." });
  }
  if (input.index === 0 || input.index === 4) {
    await db.insert(teacherAnnotations).values([
      { id: `demo-annotation-check-${input.id}`, bundleId: input.id, questionId: questions[0]!.id, pageNumber: 1, type: "check", x: 0.72, y: 0.28, width: 0.06, height: 0.06, content: "Key concept present", style: { color: "#2f7898" }, createdByUserId: input.evaluator.id, createdByRole: "evaluator" },
      { id: `demo-annotation-comment-${input.id}`, bundleId: input.id, questionId: questions[0]!.id, pageNumber: 1, type: "comment", x: 0.12, y: 0.44, width: 0.24, height: 0.08, content: "Review the final step against the rubric.", style: { color: "#a65c00" }, createdByUserId: input.evaluator.id, createdByRole: "evaluator" },
    ]);
  }
  return (await db.select().from(bundles).where(eq(bundles.id, input.id)).limit(1))[0];
}

export async function ensureDemoData(): Promise<DemoSeedSummary> {
  if (!isDemoMode()) return { enabled: false, seeded: false };
  const db = await getDb();
  if (!db) return { enabled: true, seeded: false, reason: "database unavailable" };
  const passwordHash = hashPassword(demoPassword());
  const seededUsers = new Map<string, SeededUser>();
  for (const account of demoAccounts()) seededUsers.set(account.email, await seedUser(db, account, passwordHash));
  const admin = seededUsers.get("admin.demo@example.com")!;
  const scanner = seededUsers.get("scanner.demo@example.com")!;
  const evaluatorBySubject = new Map<string, SeededUser>();
  for (const [email, , subject] of evaluatorNames) evaluatorBySubject.set(subject, seededUsers.get(email)!);
  const studentAccount = seededUsers.get("student.demo@example.com")!;

  for (const school of schoolBlueprints) {
    await db.insert(schools).values({ id: school.id, name: school.name, code: school.code, centerName: DEMO_CENTER, location: school.location, status: "active", isDemo: true }).onConflictDoUpdate({ target: schools.id, set: { name: school.name, code: school.code, centerName: DEMO_CENTER, location: school.location, status: "active", isDemo: true } });
  }
  await db.insert(examSessions).values({ id: DEMO_SESSION_ID, name: "DRISHTI Class XII Demonstration Examination 2026", code: "DRISHTI-DEMO-2026", centerName: DEMO_CENTER, status: "open", recheckStatus: "open", recheckOpenUntil: new Date(Date.now() + 14 * 86_400_000), isDemo: true, createdByUserId: admin.id }).onConflictDoUpdate({ target: examSessions.id, set: { name: "DRISHTI Class XII Demonstration Examination 2026", centerName: DEMO_CENTER, status: "open", recheckStatus: "open", recheckOpenUntil: new Date(Date.now() + 14 * 86_400_000), isDemo: true, createdByUserId: admin.id } });
  await seedCalibrationSamples(db);

  const paperRows = new Map<string, typeof examPapers.$inferSelect>();
  for (const blueprint of paperBlueprints) {
    const existing = (await db.select().from(examPapers).where(eq(examPapers.id, blueprint.id)).limit(1))[0];
    const qrExpiresAt = blueprint.qrStatus === "expired" ? new Date(Date.now() - 86_400_000) : null;
    const qrToken = existing?.qrToken ?? issueIntakeQr({ paperId: blueprint.id, sessionId: DEMO_SESSION_ID, expiresAt: qrExpiresAt });
    const qrSchemaVersion = existing?.qrToken
      ? (existing.qrSchemaVersion ?? 1)
      : INTAKE_QR_SCHEMA_VERSION;
    await db.insert(markingSchemes).values({ id: blueprint.schemeId, title: `${blueprint.subject} demonstration marking scheme`, subject: blueprint.subject, maximumMarks: blueprint.maximumMarks, questions: blueprint.questions, createdByRole: "admin", isDemo: true }).onConflictDoUpdate({ target: markingSchemes.id, set: { title: `${blueprint.subject} demonstration marking scheme`, subject: blueprint.subject, maximumMarks: blueprint.maximumMarks, questions: blueprint.questions, createdByRole: "admin", isDemo: true } });
    await db.insert(examPapers).values({ id: blueprint.id, examSessionId: DEMO_SESSION_ID, subject: blueprint.subject, subjectCode: blueprint.subjectCode, paperCode: blueprint.paperCode, title: blueprint.title, className: "Class XII", setNumber: blueprint.setNumber, bundleLabel: `${blueprint.subject} ${blueprint.subjectCode} / Set ${blueprint.setNumber}`, maximumMarks: blueprint.maximumMarks, expectedQuestionCount: blueprint.questions.length, schemeId: blueprint.schemeId, qrToken, qrStatus: blueprint.qrStatus, qrSchemaVersion, qrIssuedAt: new Date(), qrExpiresAt, status: "active", isDemo: true, createdByUserId: admin.id }).onConflictDoUpdate({ target: examPapers.id, set: { subject: blueprint.subject, subjectCode: blueprint.subjectCode, paperCode: blueprint.paperCode, title: blueprint.title, className: "Class XII", setNumber: blueprint.setNumber, bundleLabel: `${blueprint.subject} ${blueprint.subjectCode} / Set ${blueprint.setNumber}`, maximumMarks: blueprint.maximumMarks, expectedQuestionCount: blueprint.questions.length, schemeId: blueprint.schemeId, qrToken, qrStatus: blueprint.qrStatus, qrSchemaVersion, qrIssuedAt: new Date(), qrExpiresAt, status: "active", isDemo: true, updatedAt: new Date() } });
    paperRows.set(blueprint.subject, (await db.select().from(examPapers).where(eq(examPapers.id, blueprint.id)).limit(1))[0]!);
  }

  const demoStudents: typeof students.$inferSelect[] = [];
  for (let index = 0; index < studentNames.length; index++) {
    const school = schoolBlueprints[index % schoolBlueprints.length]!;
    const row = { id: `demo-student-${String(index + 1).padStart(2, "0")}`, userId: index === 0 ? studentAccount.id : null, candidateId: `DEMO-${String(1001 + index)}`, name: studentNames[index]!, dateOfBirth: index === 0 ? "2008-05-14" : `${2007 + (index % 2)}-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 20) + 1).padStart(2, "0")}`, schoolId: school.id, examSessionId: DEMO_SESSION_ID, isDemo: true };
    await db.insert(students).values(row).onConflictDoUpdate({ target: students.id, set: { userId: row.userId, candidateId: row.candidateId, name: row.name, dateOfBirth: row.dateOfBirth, schoolId: row.schoolId, examSessionId: row.examSessionId, isDemo: true, updatedAt: new Date() } });
    demoStudents.push((await db.select().from(students).where(eq(students.id, row.id)).limit(1))[0]!);
  }

  for (let index = 0; index < evaluatorNames.length; index++) {
    const [email, , subject] = evaluatorNames[index]!;
    const evaluator = seededUsers.get(email)!;
    await db.insert(evaluatorProfiles).values({ userId: evaluator.id, subject, centerName: DEMO_CENTER, isDemo: true }).onConflictDoUpdate({ target: evaluatorProfiles.userId, set: { subject, centerName: DEMO_CENTER, isDemo: true, updatedAt: new Date() } });
  }

  const statePlan: Bundle["processingState"][] = ["completed", "completed", "completed", "submitted", "recheck_required", "grading", "grading", "assigned", "assigned", "assigned", "ready_for_evaluation", "ready_for_evaluation", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved", "saved"];
  const bundleStudents = [demoStudents[0]!, demoStudents[0]!, ...demoStudents.slice(1, 24)];
  const seededBundles: typeof bundles.$inferSelect[] = [];
  for (let index = 0; index < bundleStudents.length; index++) {
    const student = bundleStudents[index]!;
    const blueprint = paperBlueprints[index % paperBlueprints.length]!;
    const paper = paperRows.get(blueprint.subject)!;
    const evaluator = evaluatorBySubject.get(blueprint.subject)!;
    const state = statePlan[index]!;
    const bundle = await seedBundle(db, { id: `demo-bundle-${String(index + 1).padStart(3, "0")}`, student, paper, scanner, evaluator, state, index });
    seededBundles.push(bundle!);
  }
  const finalizedStudentBundle = seededBundles[0]!;
  const existingRequest = (await db.select().from(recheckRequests).where(eq(recheckRequests.id, "demo-recheck-request-001")).limit(1))[0];
  if (!existingRequest) await db.insert(recheckRequests).values({ id: "demo-recheck-request-001", bundleId: finalizedStudentBundle.id, studentReference: demoStudents[0]!.candidateId, reason: "Please review the evaluation of the calculus response and confirm the final marks.", status: "requested" });

  return { enabled: true, seeded: true, credentials: { emails: demoAccounts().map(account => account.email) }, qrPayload: `DRISHTI-INTAKE:${paperRows.get("Mathematics")!.qrToken}` };
}
