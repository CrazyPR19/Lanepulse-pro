"use client";

// LanePulse Pro - top-level auth gate

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { api, ApiError } from "@/lib/api-client";
import { useAppStore, canAccess, defaultViewForRole } from "@/lib/store";
import { SetupWizard } from "@/components/setup-wizard";
import { LoginScreen } from "@/components/login-screen";
import { AppShell } from "@/components/app-shell";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

import { DashboardView } from "@/components/views/dashboard-view";
import { TimerView } from "@/components/views/timer-view";
import { SwimmersView } from "@/components/views/swimmers-view";
import { GroupsView } from "@/components/views/groups-view";
import { HistoryView } from "@/components/views/history-view";
import { AnalysisView } from "@/components/views/analysis-view";
import { AdminView } from "@/components/views/admin-view";
import { SettingsView } from "@/components/views/settings-view";
import { ParentDashboardView } from "@/components/views/parent-dashboard-view";
import { TrainingPlanView } from "@/components/views/training-plan-view";
import { PracticeConsoleView } from "@/components/views/practice-console-view";
import { PlatformAdminView } from "@/components/views/platform-admin-view";
import { AcademyOnboarding } from "@/components/academy-onboarding";
import { useQuery } from "@tanstack/react-query";

type Phase = "loading" | "setup" | "login" | "app" | "database-error" | "access-error";
type SetupFailure = "DATABASE_UNAVAILABLE" | "DATABASE_SCHEMA_NOT_READY";
type ProfileFailure = { code: string; message: string };

export function AuthGate() {
  const { data: session, status } = useSession();
  const { user, setUser, view, hasSetup, setHasSetup, setView } = useAppStore();
  const [setupFailure, setSetupFailure] = useState<SetupFailure | null>(null);
  const [setupCheck, setSetupCheck] = useState(0);
  const [profileFailure, setProfileFailure] = useState<ProfileFailure | null>(null);
  const [profileCheck, setProfileCheck] = useState(0);
  const academySettings = useQuery<any>({ queryKey: ["academy", "settings"], queryFn: () => api.get("/api/academy/settings"), enabled: !!user?.academyId && user.role === "ACADEMY_OWNER" });

  // Check setup status on first mount (side-effect only — no setState-in-effect
  // rule violation because setHasSetup is called inside an async callback, not
  // synchronously in the effect body).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<{ ready: boolean; needsSetup: boolean; hasUsers: boolean }>(
          "/api/setup"
        );
        if (cancelled) return;
        setSetupFailure(null);
        setHasSetup(!s.needsSetup);
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof ApiError ? error.code : undefined;
        setHasSetup(undefined);
        setSetupFailure(
          code === "DATABASE_SCHEMA_NOT_READY"
            ? "DATABASE_SCHEMA_NOT_READY"
            : "DATABASE_UNAVAILABLE",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setHasSetup, setupCheck]);

  // When authenticated but user profile not yet loaded, fetch it.
  useEffect(() => {
    if (status === "authenticated" && session?.user && !user && hasSetup) {
      setProfileFailure(null);
      api
        .get<any>("/api/me")
        .then((u) => setUser(u))
        .catch((error) => {
          const failure = error instanceof ApiError
            ? { code: error.code ?? "ACCESS_DENIED", message: error.message }
            : { code: "ACCESS_DENIED", message: "Your account could not be loaded." };
          setProfileFailure(failure);
        });
    }
  }, [status, session, user, setUser, hasSetup, profileCheck]);

  // Derive phase from current state — no stored state, no setState-in-effect.
  const phase: Phase = (() => {
    if (setupFailure) return "database-error";
    if (status === "loading" || hasSetup === undefined) return "loading";
    if (!hasSetup) return "setup";
    if (profileFailure) return "access-error";
    if (status === "authenticated" && session?.user) return "app";
    return "login";
  })();

  if (phase === "database-error") {
    const schemaMissing = setupFailure === "DATABASE_SCHEMA_NOT_READY";
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-lg border border-amber-400/30 bg-slate-900 p-6 text-center text-white shadow-xl">
          <AlertTriangle className="mx-auto size-10 text-amber-400" />
          <h1 className="mt-4 text-xl font-semibold">
            {schemaMissing ? "Database setup incomplete" : "Database temporarily unavailable"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {schemaMissing
              ? "LanePulse cannot start until the production database migrations have been applied."
              : "LanePulse could not connect to its database. Please try again shortly."}
          </p>
          <Button className="mt-5 min-h-11" onClick={() => { setSetupFailure(null); setSetupCheck((value) => value + 1); }}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "access-error" && profileFailure) {
    const titles: Record<string, string> = {
      ACADEMY_MISSING: "Academy assignment missing",
      ACCOUNT_DISABLED: "Account disabled",
      ACADEMY_DISABLED: "Academy disabled",
      ACCESS_DENIED: "Access denied",
      USER_NOT_FOUND: "Account not found",
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-lg border border-amber-400/30 bg-slate-900 p-6 text-center text-white shadow-xl">
          <AlertTriangle className="mx-auto size-10 text-amber-400" />
          <h1 className="mt-4 text-xl font-semibold">{titles[profileFailure.code] ?? "Account unavailable"}</h1>
          <p className="mt-2 text-sm text-slate-300">{profileFailure.message}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => { setProfileFailure(null); setProfileCheck((value) => value + 1); }}>
              <RefreshCw className="size-4" /> Retry
            </Button>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  // When user loads, if their role can't access the current view, switch to their default.
  useEffect(() => {
    if (user?.platformRole === "PLATFORM_SUPER_ADMIN" && view !== "platform") {
      setView("platform");
    } else if (user && user.platformRole !== "PLATFORM_SUPER_ADMIN" && !canAccess(view, user.role)) {
      setView(defaultViewForRole(user.role));
    }
  }, [user, view, setView]);

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0b1f3a] via-[#0e3a6b] to-[#1f9fbf] gap-4">
        <Logo size={64} className="lp-wave-anim" />
        <Loader2 className="size-6 animate-spin text-white" />
        <p className="text-white/80 text-sm">Loading LanePulse Pro…</p>
      </div>
    );
  }

  if (phase === "setup") return <SetupWizard />;
  if (phase === "login") return <LoginScreen />;

  // App phase — but ensure user is loaded
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Logo size={48} />
        <Loader2 className="size-5 animate-spin text-aqua" />
      </div>
    );
  }

  if (user.role === "ACADEMY_OWNER" && academySettings.data && !academySettings.data.settings?.onboardingCompleted) {
    return <AcademyOnboarding academy={academySettings.data} />;
  }

  return (
    <AppShell>
      {view === "dashboard" && <DashboardView />}
      {view === "timer" && <TimerView />}
      {view === "training-plan" && <TrainingPlanView />}
      {view === "practice" && <PracticeConsoleView />}
      {view === "swimmers" && <SwimmersView />}
      {view === "groups" && <GroupsView />}
      {view === "history" && <HistoryView />}
      {view === "analysis" && <AnalysisView />}
      {view === "admin" && <AdminView />}
      {view === "settings" && <SettingsView />}
      {view === "parent" && <ParentDashboardView />}
      {view === "platform" && <PlatformAdminView />}
    </AppShell>
  );
}
