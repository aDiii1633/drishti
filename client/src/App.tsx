import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Protected from "./pages/Protected";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const QrVerify = lazy(() => import("./pages/QrVerify"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ScanIntake = lazy(() => import("./pages/ScanIntake"));
const Marking = lazy(() => import("./pages/Marking"));
const Audit = lazy(() => import("./pages/Audit"));
const History = lazy(() => import("./pages/History"));
const Answers = lazy(() => import("./pages/Answers"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const Settings = lazy(() => import("./pages/Settings"));
const Calibration = lazy(() => import("./pages/Calibration"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RouteFallback() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#fafaf9] p-6">
      <div className="text-center" role="status" aria-live="polite">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#ded8cf] border-t-[#7c5e10]" />
        <p className="mono-label mt-4 text-[#78716c]">Loading Drishti</p>
      </div>
    </main>
  );
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
      <Route path={"/login"} component={Login} />
      <Route path={"/verify/:token"} component={QrVerify} />
      <Route path={"/dashboard"}>
        {() => (
          <Protected>
            <Dashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/scan"}>
        {() => (
          <Protected>
            <ScanIntake />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/marking"}>
        {() => (
          <Protected>
            <Marking />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/audit"}>
        {() => (
          <Protected>
            <Audit />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/history"}>
        {() => (
          <Protected>
            <History />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/answers"}>
        {() => (
          <Protected>
            <Answers />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/evaluations"}>
        {() => (
          <Protected>
            <Evaluations />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/settings"}>
        {() => (
          <Protected>
            <Settings />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/calibration"}>
        {() => (
          <Protected>
            <Calibration />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/mongo"}>
        {() => (
          <Protected>
            <AdminConsole />
          </Protected>
        )}
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<RouteFallback />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
