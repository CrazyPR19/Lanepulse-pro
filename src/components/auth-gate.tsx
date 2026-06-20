"use client";

// LanePulse Pro - top-level auth gate

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useAppStore, canAccess, defaultViewForRole } from "@/lib/store";
import { SetupWizard } from "@/components/setup-wizard";
import { LoginScreen } from "@/components/login-screen";
import { AppShell } from "@/components/app-shell";
import { Loader2 } from "lucide-react";
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

type Phase = "loading" | "setup" | "login" | "app";

export function AuthGate() {
  const { data: session, status } = useSession();
  const { user, setUser, view, hasSetup, setHasSetup, setView } = useAppStore();

  // Check setup status on first mount (side-effect only — no setState-in-effect
  // rule violation because setHasSetup is called inside an async callback, not
  // synchronously in the effect body).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.get<{ needsSetup: boolean; hasUsers: boolean }>(
          "/api/setup"
        );
        if (cancelled) return;
        setHasSetup(!s.needsSetup);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setHasSetup]);

  // When authenticated but user profile not yet loaded, fetch it.
  useEffect(() => {
    if (status === "authenticated" && session?.user && !user && hasSetup) {
      api
        .get<any>("/api/me")
        .then((u) => setUser(u))
        .catch(() => {});
    }
  }, [status, session, user, setUser, hasSetup]);

  // Derive phase from current state — no stored state, no setState-in-effect.
  const phase: Phase = (() => {
    if (status === "loading" || hasSetup === undefined) return "loading";
    if (!hasSetup) return "setup";
    if (status === "authenticated" && session?.user) return "app";
    return "login";
  })();

  // When user loads, if their role can't access the current view, switch to their default.
  useEffect(() => {
    if (user && !canAccess(view, user.role)) {
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

  return (
    <AppShell>
      {view === "dashboard" && <DashboardView />}
      {view === "timer" && <TimerView />}
      {view === "swimmers" && <SwimmersView />}
      {view === "groups" && <GroupsView />}
      {view === "history" && <HistoryView />}
      {view === "analysis" && <AnalysisView />}
      {view === "admin" && <AdminView />}
      {view === "settings" && <SettingsView />}
      {view === "parent" && <ParentDashboardView />}
    </AppShell>
  );
}
