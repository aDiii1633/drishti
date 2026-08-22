import DrishtiShell from "@/components/DrishtiShell";
import DrishtiAssistantLauncher from "@/components/DrishtiAssistantLauncher";
import type { DrishtiRole } from "@shared/drishti";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Protected({
  children,
  role,
  bare = false,
}: {
  children: React.ReactNode;
  role?: DrishtiRole | DrishtiRole[];
  bare?: boolean;
}) {
  const [location, setLocation] = useLocation();
  const session = trpc.session.current.useQuery();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      session.refetch();
      setLocation("/role-selection");
    },
  });
  const allowed =
    !role ||
    (session.data &&
      (Array.isArray(role)
        ? role.includes(session.data.role)
        : session.data.role === role));
  useEffect(() => {
    if (session.isLoading) return;
    if (!session.data) setLocation("/role-selection");
    else if (session.data.mustChangePassword && location !== "/password-change") setLocation("/password-change");
    else if (!allowed)
      setLocation(
        session.data.role === "school_admin"
          ? "/school-admin"
          : session.data.role === "evaluator"
            ? "/evaluator"
            : session.data.role === "admin"
              ? "/admin"
              : session.data.role === "student"
                ? "/student"
            : "/scanner"
      );
  }, [allowed, location, session.data, session.isLoading, setLocation]);
  if (session.isLoading || !session.data || !allowed) return null;
  if (bare) return <>{children}<DrishtiAssistantLauncher session={session.data} /></>;
  return <DrishtiShell session={session.data}>{children}<DrishtiAssistantLauncher session={session.data} /></DrishtiShell>;
}
