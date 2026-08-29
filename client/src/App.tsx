import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import type { DrishtiRole } from "@shared/drishti";
import { trpc } from "@/lib/trpc";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Protected from "./pages/Protected";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const RoleLogin = lazy(() => import("./pages/RoleLogin"));
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const PhotographerDashboard = lazy(
  () => import("./pages/PhotographerDashboard")
);
const EvaluatorDashboard = lazy(() => import("./pages/EvaluatorDashboard"));
const EvaluatorHome = lazy(() => import("./pages/EvaluatorHome"));
const EvaluatorProfile = lazy(() => import("./pages/EvaluatorProfile"));
const EvaluatorHelp = lazy(() => import("./pages/EvaluatorHelp"));
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
const ExamSetup = lazy(() => import("./pages/ExamSetup"));
const AdminSchools = lazy(() => import("./pages/AdminSchools"));
const AdminSchoolDetails = lazy(() => import("./pages/AdminSchoolDetails"));
const AdminEvaluators = lazy(() => import("./pages/AdminEvaluators"));
const AdminEvaluatorDetails = lazy(
  () => import("./pages/AdminEvaluatorDetails")
);
const AdminAnswerSheets = lazy(() => import("./pages/AdminAnswerSheets"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PasswordChange = lazy(() => import("./pages/PasswordChange"));
const StudentPortal = lazy(() => import("./pages/StudentPortal"));
const SchoolAdminDashboard = lazy(() => import("./pages/SchoolAdminDashboard"));

function RouteFallback() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8fcff] p-6">
      <div className="text-center" role="status" aria-live="polite">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#ded8cf] border-t-[#2f6f95]" />
        <p className="mono-label mt-4 text-[#6b8190]">Loading Drishti</p>
      </div>
    </main>
  );
}

/** Demo access mode opens on the role screen; otherwise the marketing landing. */
function Entry() {
  const access = trpc.session.access.useQuery();
  if (access.isLoading) return <RouteFallback />;
  return access.data?.demoAccess ? <RoleSelection /> : <Landing />;
}

/**
 * Credential screens stay in the codebase but are unreachable while demo access
 * is enabled, so turning DEMO_ACCESS_MODE off restores real sign-in with no
 * further code changes.
 */
function CredentialLogin({ role }: { role?: DrishtiRole }) {
  const access = trpc.session.access.useQuery();
  const [, setLocation] = useLocation();
  const demoAccess = access.data?.demoAccess === true;
  useEffect(() => {
    if (demoAccess) setLocation("/role-selection");
  }, [demoAccess, setLocation]);
  if (access.isLoading || demoAccess) return <RouteFallback />;
  return role ? <RoleLogin role={role} /> : <Login />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Entry} />
      <Route path={"/role-selection"} component={RoleSelection} />
      <Route path={"/login"}>{() => <CredentialLogin />}</Route>
      <Route path={"/admin/login"}>
        {() => <CredentialLogin role="admin" />}
      </Route>
      <Route path={"/evaluator/login"}>
        {() => <CredentialLogin role="evaluator" />}
      </Route>
      <Route path={"/school-admin/login"}>
        {() => <CredentialLogin role="school_admin" />}
      </Route>
      <Route path={"/student/login"}>
        {() => <CredentialLogin role="student" />}
      </Route>
      <Route path={"/operator/login"}>
        {() => <CredentialLogin role="operator" />}
      </Route>
      <Route path={"/scanner/login"}>
        {() => <CredentialLogin role="operator" />}
      </Route>
      <Route path={"/photographer/login"}>
        {() => <CredentialLogin role="operator" />}
      </Route>
      <Route path={"/verify/:token"} component={QrVerify} />
      <Route path={"/password-change"}>
        {() => (
          <Protected bare>
            <PasswordChange />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard"}>
        {() => (
          <Protected role="admin">
            <Dashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/scan"}>
        {() => (
          <Protected role="admin">
            <ScanIntake />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/marking"}>
        {() => (
          <Protected role={["evaluator", "admin"]}>
            <Marking />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/audit"}>
        {() => (
          <Protected role="admin">
            <Audit />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/history"}>
        {() => (
          <Protected role="admin">
            <History />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/answers"}>
        {() => (
          <Protected role="admin">
            <Answers />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/evaluations"}>
        {() => (
          <Protected role={["evaluator", "admin"]}>
            <Evaluations />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/settings"}>
        {() => (
          <Protected role="admin">
            <Settings />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/calibration"}>
        {() => (
          <Protected role="admin">
            <Calibration />
          </Protected>
        )}
      </Route>
      <Route path={"/dashboard/mongo"}>
        {() => (
          <Protected role="admin">
            <AdminConsole />
          </Protected>
        )}
      </Route>
      <Route path={"/admin"}>
        {() => (
          <Protected role="admin">
            <Dashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/scan"}>
        {() => (
          <Protected role="admin">
            <ScanIntake />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/marking"}>
        {() => (
          <Protected role="admin">
            <Marking />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/audit"}>
        {() => (
          <Protected role="admin">
            <Audit />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/history"}>
        {() => (
          <Protected role="admin">
            <History />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/settings"}>
        {() => (
          <Protected role="admin">
            <Settings />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/mongo"}>
        {() => (
          <Protected role="admin">
            <AdminConsole />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/exams"}>
        {() => (
          <Protected role="admin">
            <ExamSetup />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/schools/:id"}>
        {() => (
          <Protected role="admin">
            <AdminSchoolDetails />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/schools"}>
        {() => (
          <Protected role="admin">
            <AdminSchools />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/evaluators/:id"}>
        {() => (
          <Protected role="admin">
            <AdminEvaluatorDetails />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/evaluators"}>
        {() => (
          <Protected role="admin">
            <AdminEvaluators />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/answer-sheets"}>
        {() => (
          <Protected role="admin">
            <AdminAnswerSheets view="all" />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/scanned"}>
        {() => (
          <Protected role="admin">
            <AdminAnswerSheets view="scanned" />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/assigned"}>
        {() => (
          <Protected role="admin">
            <AdminAnswerSheets view="assigned" />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/evaluated"}>
        {() => (
          <Protected role="admin">
            <AdminAnswerSheets view="evaluated" />
          </Protected>
        )}
      </Route>
      <Route path={"/admin/pending-evaluation"}>
        {() => (
          <Protected role="admin">
            <AdminAnswerSheets view="pending" />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator"}>
        {() => (
          <Protected role="evaluator">
            <EvaluatorHome />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator/profile"}>
        {() => (
          <Protected role="evaluator">
            <EvaluatorProfile />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator/papers"}>
        {() => (
          <Protected role="evaluator">
            <EvaluatorDashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator/help"}>
        {() => (
          <Protected role="evaluator">
            <EvaluatorHelp />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator/checking/:bundleId"}>
        {() => (
          <Protected role="evaluator" bare>
            <Marking />
          </Protected>
        )}
      </Route>
      <Route path={"/evaluator/paper/:bundleId"}>
        {() => (
          <Protected role="evaluator">
            <Marking />
          </Protected>
        )}
      </Route>
      <Route path={"/school-admin"}>
        {() => (
          <Protected role="school_admin">
            <SchoolAdminDashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/student"}>
        {() => (
          <Protected role="student">
            <StudentPortal />
          </Protected>
        )}
      </Route>
      <Route path={"/photographer"}>
        {() => (
          <Protected role="operator">
            <PhotographerDashboard />
          </Protected>
        )}
      </Route>
      <Route path={"/scanner"}>
        {() => (
          <Protected role="operator">
            <PhotographerDashboard />
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
