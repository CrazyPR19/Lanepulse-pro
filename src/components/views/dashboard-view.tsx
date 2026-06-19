"use client";

// LanePulse Pro - Coach Dashboard Overview (Task 5)

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { formatSeconds } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import type {
  SwimmerDTO,
  TrainingGroupDTO,
  TrainingSessionDTO,
  SessionLaneDTO,
  CurrentVsPreviousReport,
  SessionStatus,
} from "@/lib/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users,
  Grid3x3,
  History,
  TrendingUp,
  Timer as TimerIcon,
  UserPlus,
  Layers,
  BarChart3,
  ArrowRight,
  Trophy,
  CalendarDays,
  Waves,
  Activity,
  ChevronRight,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun .. 6=Sat
  const diff = (day + 6) % 7; // Monday start
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const STATUS_BADGE: Record<SessionStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-800 border-amber-200",
  RUNNING: "bg-aqua/20 text-aqua border-aqua/30",
  COMPLETED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ABORTED: "bg-rose-100 text-rose-800 border-rose-200",
};

// ---------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  isLoading,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  isLoading?: boolean;
  hint?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardDescription className="text-xs uppercase tracking-wider font-medium">
            {label}
          </CardDescription>
          <div
            className={cn(
              "size-9 rounded-lg flex items-center justify-center shrink-0",
              accent
            )}
          >
            <Icon className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-bold tracking-tight lp-timer-digits">
            {value}
          </div>
        )}
        {hint && (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------
// Quick action button
// ---------------------------------------------------------------

function QuickAction({
  label,
  description,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="h-auto py-4 px-4 flex-col items-start gap-2 text-left w-full hover:shadow-md transition-shadow bg-card"
    >
      <div className="flex items-center gap-3 w-full">
        <div
          className={cn(
            "size-10 rounded-lg flex items-center justify-center shrink-0",
            accent
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{label}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {description}
          </div>
        </div>
        <ArrowRight className="size-4 text-muted-foreground shrink-0" />
      </div>
    </Button>
  );
}

// ---------------------------------------------------------------
// Session detail dialog
// ---------------------------------------------------------------

function SessionDetailDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["session-detail", sessionId],
    enabled: !!sessionId && open,
    queryFn: () =>
      api.get<
        TrainingSessionDTO & { lanes: SessionLaneDTO[] }
      >(`/api/sessions/${sessionId}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-aqua" />
            Session Detail
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${data.sessionName} • ${formatDateShort(data.sessionDate)}`
              : "Loading session…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive py-4">
            Failed to load session details.
          </div>
        )}

        {data && !isLoading && (
          <ScrollArea className="flex-1 max-h-[60vh] -mx-1 px-1">
            <div className="space-y-4">
              {/* Meta row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Style</div>
                  <div className="font-medium truncate">
                    {data.styleName ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Distance</div>
                  <div className="font-medium">{data.distanceMeters}m</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Group</div>
                  <div className="font-medium truncate">
                    {data.groupName ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <Badge
                    className={cn(
                      "mt-0.5",
                      STATUS_BADGE[data.status]
                    )}
                  >
                    {data.status}
                  </Badge>
                </div>
              </div>

              {/* Lanes */}
              <div>
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Layers className="size-4 text-aqua" />
                  Lanes ({data.lanes?.length ?? 0})
                </div>
                <div className="space-y-2">
                  {data.lanes?.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4 text-center border rounded-md bg-muted/30">
                      No lanes recorded.
                    </div>
                  )}
                  {data.lanes?.map((lane) => (
                    <div
                      key={lane.id}
                      className="border rounded-lg p-3 bg-muted/20"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="secondary"
                            className="bg-navy text-white"
                          >
                            Lane {lane.laneNo}
                          </Badge>
                          <span className="font-medium text-sm truncate">
                            {lane.swimmerName ?? "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              lane.status === "FINISHED"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : lane.status === "DNF"
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : "bg-muted text-muted-foreground"
                            )}
                          >
                            {lane.status}
                          </Badge>
                          {lane.resultText && (
                            <span className="font-mono text-sm font-semibold lp-timer-digits">
                              {lane.resultText}
                            </span>
                          )}
                        </div>
                      </div>
                      {lane.laps && lane.laps.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {lane.laps.map((lap) => (
                            <Badge
                              key={lap.id}
                              variant="outline"
                              className="font-mono text-xs lp-timer-digits"
                            >
                              L{lap.lapNo}: {lap.lapTimeText}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Main dashboard view
// ---------------------------------------------------------------

export function DashboardView() {
  const user = useAppStore((s) => s.user);
  const setView = useAppStore((s) => s.setView);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // --- queries ---
  const swimmersQ = useQuery({
    queryKey: ["swimmers", "active"],
    queryFn: () => api.get<SwimmerDTO[]>("/api/swimmers?active=true"),
  });

  const groupsQ = useQuery({
    queryKey: ["groups", "active"],
    queryFn: () => api.get<TrainingGroupDTO[]>("/api/groups?active=true"),
  });

  const sessionsThisWeekQ = useQuery({
    queryKey: ["sessions", "week"],
    queryFn: () => {
      const from = startOfWeek(new Date()).toISOString();
      return api.get<TrainingSessionDTO[]>(`/api/sessions?from=${encodeURIComponent(from)}`);
    },
  });

  const recentSessionsQ = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => api.get<TrainingSessionDTO[]>("/api/sessions"),
  });

  const cvpQ = useQuery({
    queryKey: ["analysis", "current-vs-previous", "dashboard"],
    queryFn: () =>
      api.get<CurrentVsPreviousReport[]>(
        "/api/analysis/current-vs-previous"
      ),
  });

  // --- derived ---
  const activeSwimmerCount = swimmersQ.data?.length ?? 0;
  const activeGroupCount = groupsQ.data?.length ?? 0;
  const sessionsThisWeekCount = sessionsThisWeekQ.data?.length ?? 0;

  const avgImprovement = useMemo(() => {
    const reports = cvpQ.data ?? [];
    const improved = reports.filter(
      (r) =>
        r.direction === "IMPROVED" &&
        typeof r.changePercent === "number" &&
        isFinite(r.changePercent)
    );
    if (improved.length === 0) return 0;
    const total = improved.reduce((sum, r) => sum + (r.changePercent ?? 0), 0);
    return total / improved.length;
  }, [cvpQ.data]);

  const topPerformers = useMemo(() => {
    const reports = cvpQ.data ?? [];
    return reports
      .filter(
        (r) =>
          r.direction === "IMPROVED" &&
          typeof r.changePercent === "number" &&
          isFinite(r.changePercent)
      )
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
      .slice(0, 5);
  }, [cvpQ.data]);

  const recentSessions = useMemo(() => {
    return (recentSessionsQ.data ?? []).slice(0, 5);
  }, [recentSessionsQ.data]);

  const roleLabel = user?.role
    ? user.role === "SUPER_ADMIN"
      ? "Super Admin"
      : user.role === "COACH"
        ? "Coach"
        : "Viewer"
    : "";

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <CalendarDays className="size-3.5" />
            {formatToday()}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 flex items-center gap-2 flex-wrap">
            <Waves className="size-7 text-aqua lp-wave-anim" />
            Welcome, {user?.fullName?.split(" ")[0] ?? "Coach"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here&apos;s your team&apos;s training pulse at a glance.
          </p>
        </div>
        <Badge
          className="bg-aqua/20 text-aqua border-aqua/30 self-start"
          variant="outline"
        >
          <Activity className="size-3.5" />
          {roleLabel}
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Active Swimmers"
          value={activeSwimmerCount}
          icon={Users}
          accent="bg-aqua/15 text-aqua"
          isLoading={swimmersQ.isLoading}
        />
        <StatCard
          label="Active Groups"
          value={activeGroupCount}
          icon={Grid3x3}
          accent="bg-navy/10 text-navy"
          isLoading={groupsQ.isLoading}
        />
        <StatCard
          label="Sessions This Week"
          value={sessionsThisWeekCount}
          icon={History}
          accent="bg-emerald-100 text-emerald-700"
          isLoading={sessionsThisWeekQ.isLoading}
        />
        <StatCard
          label="Avg Improvement"
          value={
            cvpQ.isLoading
              ? ""
              : `${avgImprovement > 0 ? "+" : ""}${avgImprovement.toFixed(1)}%`
          }
          icon={TrendingUp}
          accent="bg-amber-100 text-amber-700"
          isLoading={cvpQ.isLoading}
          hint={
            cvpQ.data && cvpQ.data.length > 0
              ? `${cvpQ.data.filter((r) => r.direction === "IMPROVED").length} improved this period`
              : "No comparison data yet"
          }
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-aqua" />
            Quick Actions
          </CardTitle>
          <CardDescription>
            Jump straight into the most common coaching tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickAction
              label="Start New Session"
              description="Open the 12-lane timing console"
              icon={TimerIcon}
              accent="bg-aqua/15 text-aqua"
              onClick={() => setView("timer")}
            />
            <QuickAction
              label="Add Swimmer"
              description="Register a new team member"
              icon={UserPlus}
              accent="bg-navy/10 text-navy"
              onClick={() => setView("swimmers")}
            />
            <QuickAction
              label="Build Group"
              description="Assemble heats and assign lanes"
              icon={Layers}
              accent="bg-emerald-100 text-emerald-700"
              onClick={() => setView("groups")}
            />
            <QuickAction
              label="View Analysis"
              description="Compare times and surface trends"
              icon={BarChart3}
              accent="bg-amber-100 text-amber-700"
              onClick={() => setView("analysis")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Two-column: Recent sessions + Top performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent sessions */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-aqua" />
              Recent Sessions
            </CardTitle>
            <CardDescription>
              The latest 5 recorded training sessions. Tap to inspect lanes &amp; laps.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ScrollArea className="max-h-80 -mx-1 px-1">
              {recentSessionsQ.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              )}
              {!recentSessionsQ.isLoading && recentSessions.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center border rounded-md bg-muted/30">
                  No sessions yet. Start your first one from the timing console.
                </div>
              )}
              <div className="space-y-2">
                {recentSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className="w-full text-left border rounded-lg p-3 hover:bg-accent/50 transition-colors flex items-center gap-3 group"
                  >
                    <div className="size-10 rounded-lg bg-navy/10 text-navy flex items-center justify-center shrink-0 font-semibold">
                      {s.laneCount ?? 0}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {s.sessionName}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>{formatDateShort(s.sessionDate)}</span>
                        <span className="text-border">•</span>
                        <span className="truncate">
                          {s.styleName ?? "—"} • {s.distanceMeters}m
                        </span>
                        {s.groupName && (
                          <>
                            <span className="text-border">•</span>
                            <span className="truncate">{s.groupName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        className={cn("text-[10px]", STATUS_BADGE[s.status])}
                      >
                        {s.status}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Top performers */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-amber-500" />
              Top Performers
            </CardTitle>
            <CardDescription>
              Swimmers who improved the most vs. their previous session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ScrollArea className="max-h-80 -mx-1 px-1">
              {cvpQ.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              )}
              {!cvpQ.isLoading && topPerformers.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center border rounded-md bg-muted/30">
                  No improvement data yet. Once swimmers have 2+ finished
                  sessions, top performers will appear here.
                </div>
              )}
              <div className="space-y-2">
                {topPerformers.map((p, idx) => (
                  <div
                    key={p.swimmerId}
                    className="border rounded-lg p-3 flex items-center gap-3"
                  >
                    <div
                      className={cn(
                        "size-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm",
                        idx === 0
                          ? "bg-amber-100 text-amber-700"
                          : idx === 1
                            ? "bg-slate-200 text-slate-700"
                            : idx === 2
                              ? "bg-orange-100 text-orange-700"
                              : "bg-muted text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {p.swimmerName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono lp-timer-digits">
                        {p.previousTimeSeconds != null
                          ? formatSeconds(p.previousTimeSeconds)
                          : "—"}
                        {" → "}
                        {p.lastTimeSeconds != null
                          ? formatSeconds(p.lastTimeSeconds)
                          : "—"}
                      </div>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-mono lp-timer-digits shrink-0">
                      <TrendingUp className="size-3" />
                      {(p.changePercent ?? 0).toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <SessionDetailDialog
        sessionId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
