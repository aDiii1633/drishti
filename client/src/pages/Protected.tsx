import DrishtiShell from "@/components/DrishtiShell";
import { readRoleSession } from "@/lib/session";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Protected({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation(); const session = readRoleSession();
  useEffect(() => { if (!session) setLocation("/login"); }, [session, setLocation]);
  if (!session) return null;
  return <DrishtiShell>{children}</DrishtiShell>;
}
