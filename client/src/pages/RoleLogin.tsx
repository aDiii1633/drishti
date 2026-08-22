import type { DrishtiRole } from "@shared/drishti";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type RoleLoginDetails = {
  title: string;
  eyebrow: string;
  destination: string;
  image: string;
  alt: string;
  imagePosition?: string;
  localImageFallback?: string;
};

const copy: Record<DrishtiRole, RoleLoginDetails> = {
  admin: {
    title: "ADMIN ACCESS",
    eyebrow: "Restricted administration",
    destination: "/admin",
    image:
      "https://logowik.com/content/uploads/images/cbse-central-board-of-secondary-education7240.jpg",
    alt: "CBSE administration visual",
    imagePosition: "center",
  },
  school_admin: {
    title: "SCHOOL ADMIN ACCESS",
    eyebrow: "School operations",
    destination: "/school-admin",
    image:
      "https://images.unsplash.com/photo-1524069290683-0457abfe42c3?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8aW5kaWFuJTIwc2Nob29sc3xlbnwwfHwwfHx8MA%3D%3D",
    alt: "School administration visual",
    imagePosition: "center",
  },
  evaluator: {
    title: "EVALUATOR ACCESS",
    eyebrow: "Assigned marking desk",
    destination: "/evaluator",
    image:
      "file:///D:/BUSSI/ChatGPT%20Image%20Aug%2022,%202026,%2003_45_25%20AM.png",
    localImageFallback: "/role-login/evaluator.png",
    alt: "Evaluator checking answer sheets",
    imagePosition: "center",
  },
  operator: {
    title: "SCANNER ACCESS",
    eyebrow: "Scan and submission desk",
    destination: "/scanner",
    image:
      "https://www.adobe.com/acrobat/hub/media_1f85eded24ca0320f5a639502ddc82036fdbf6bbc.jpg?width=750&format=jpg&optimize=medium",
    alt: "Document scanner in use",
    imagePosition: "center",
  },
  student: {
    title: "STUDENT ACCESS",
    eyebrow: "Results and re-check portal",
    destination: "/student",
    image:
      "https://media.istockphoto.com/id/1072472414/photo/male-student-in-classroom-writing-in-notebook-stock-image.jpg?s=612x612&w=0&k=20&c=cuQi67TN1tyuH5JhaDFW_O7AMabgDsGnQMAfaau4M1E=",
    alt: "Student writing in an examination setting",
    imagePosition: "center",
  },
};

export default function RoleLogin({ role }: { role: DrishtiRole }) {
  const [, setLocation] = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [useLocalImage, setUseLocalImage] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const details = copy[role];

  useEffect(() => {
    setUseLocalImage(false);
    setImageUnavailable(false);
  }, [role]);

  const login = trpc.session.login.useMutation({
    onSuccess: result =>
      setLocation(
        result.session.mustChangePassword
          ? "/password-change"
          : details.destination
      ),
    onError: error => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate({
      role,
      loginId: loginId.trim().toLowerCase(),
      password,
      rememberMe,
    });
  };

  const imageSource =
    useLocalImage && details.localImageFallback
      ? details.localImageFallback
      : details.image;

  const handleImageError = () => {
    if (details.localImageFallback && !useLocalImage) {
      setUseLocalImage(true);
      return;
    }
    setImageUnavailable(true);
  };

  return (
    <main className="grain dot-grid grid min-h-screen bg-[#f8fcff] px-4 py-5 sm:px-6 sm:py-8 lg:place-items-center lg:px-8 lg:py-10">
      <div className="w-full max-w-6xl">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="press mb-5 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[#6b8190] hover:bg-white hover:text-[#2f6f95] sm:mb-7"
        >
          <ArrowLeft size={16} />
          Return to the record
        </button>

        <div className="overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white shadow-[0_22px_60px_rgba(38,104,139,.09)] lg:grid lg:grid-cols-[minmax(0,.9fr)_minmax(25rem,1.1fr)]">
          <section className="relative min-h-[270px] overflow-hidden bg-[#163044] p-6 text-white sm:min-h-[320px] sm:p-10 lg:min-h-[620px]">
            {!imageUnavailable ? (
              <img
                src={imageSource}
                alt={details.alt}
                onError={handleImageError}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: details.imagePosition }}
              />
            ) : null}
            <div className="absolute inset-0 bg-[#163044]/55" />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-white/15 font-display text-2xl text-white">
                  D
                </span>
                <p className="mono-label mt-8 text-[#d8edf8] sm:mt-16">
                  {details.eyebrow}
                </p>
                <h1 className="mt-3 max-w-md font-display text-4xl leading-[.9] sm:mt-4 sm:text-6xl">
                  {details.title}
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-6 text-[#e5f2f8] sm:mt-6">
                  Use your assigned DRISHTI email or user ID and password to
                  open this workspace.
                </p>
              </div>

              <div className="mt-6 border-t border-white/20 pt-4 sm:mt-10 sm:pt-5 lg:mt-0">
                <p className="mono-label text-[#c7e4f3]">Session scope</p>
                <p className="mt-2 max-w-sm text-xs leading-5 text-[#eef8fd] sm:text-sm sm:leading-6">
                  Only your authorized workspace is available after sign-in.
                </p>
              </div>
            </div>
          </section>

          <form onSubmit={submit} className="p-7 sm:p-10 lg:p-12">
            <div className="flex items-center gap-2 text-[#2f6f95]">
              <ShieldCheck size={17} />
              <span className="mono-label">DRISHTI VERIFIED ENTRY</span>
            </div>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl">
              Sign in to your desk.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#6b8190]">
              Your credentials open only the role-specific workspace assigned to
              you.
            </p>

            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mono-label text-[#6b8190]">
                  Email / User ID
                </span>
                <input
                  autoFocus
                  autoComplete="username"
                  type="text"
                  value={loginId}
                  onChange={event => setLoginId(event.target.value)}
                  className="mt-2 h-12 w-full rounded-lg border border-[#d9eaf3] bg-white px-3 text-sm outline-none focus:border-[#2f6f95]"
                  required
                />
              </label>

              <label className="block">
                <span className="mono-label text-[#6b8190]">Password</span>
                <span className="relative mt-2 block">
                  <input
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="h-12 w-full rounded-lg border border-[#d9eaf3] bg-white px-3 pr-12 text-sm outline-none focus:border-[#2f6f95]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(visible => !visible)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[#6b8190] hover:bg-[#eef7fc] hover:text-[#2f6f95]"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#587181]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={event => setRememberMe(event.target.checked)}
                  className="h-4 w-4 accent-[#2f6f95]"
                />
                <span>Remember me on this device for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="press mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2f6f95] text-sm font-semibold text-white hover:bg-[#245f80] disabled:opacity-50"
            >
              {login.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <KeyRound size={16} />
              )}
              {login.isPending ? "Signing in..." : "Sign in"}
            </button>
            <p className="mt-5 text-center text-xs leading-5 text-[#6b8190]">
              Your account is protected by a server-side password hash and a
              role-scoped session.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
