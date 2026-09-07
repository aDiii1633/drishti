import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <main className="grain dot-grid grid min-h-screen place-items-center bg-[#f8fcff] p-6 text-[#163044]">
      <div className="panel w-full max-w-xl rounded-[2rem] p-8 text-center sm:p-12">
        <p className="mono-label text-[#2f6f95]">Drishti / Page not found</p>
        <h1 className="mt-4 font-display text-6xl leading-[.9]">
          404 —{" "}
          <em className="font-display-italic text-[#2f6f95]">off the record.</em>
        </h1>
        <p className="mt-5 text-sm leading-6 text-[#6b8190]">
          The page you are looking for doesn't exist or may have been moved.
        </p>
        <button
          id="not-found-button-group"
          onClick={handleGoHome}
          className="press mt-8 inline-flex items-center gap-2 rounded-full bg-[#2f6f95] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft size={16} /> Back to Drishti
        </button>
      </div>
    </main>
  );
}
