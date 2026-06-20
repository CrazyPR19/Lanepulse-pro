"use client";

// LanePulse Pro — Parent Portal Dashboard
// Mobile-first, parent-friendly view of a child's swimming progress.
// Sporty navy/aqua/white theme. Large readable text. Simple positive language.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Award,
  Calendar,
  HeartHandshake,
  History,
  Loader2,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { formatSeconds } from "@/lib/helpers";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type {
  ParentChildSummaryDTO,
  ParentSwimmerDTO,
  Gender,
} from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Aqua + navy color constants (used by Recharts + accent elements)
const AQUA = "#1f9fbf";
const NAVY = "#0b1f3a";

// ============================================================
// Helpers
// ============================================================
function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function genderLabel(g: Gender | null): string {
  if (g === "MALE") return "Male";
  if (g === "FEMALE") return "Female";
  if (g === "OTHER") return "Other";
  return "—";
}

function ageLabel(age: number | null): string {
  if (age === null || age === undefined) return "—";
  return `${age} yrs`;
}

// Improvement message based on latestVsPrevious.direction
function improvementMessage(
  lv: ParentChildSummaryDTO["latestVsPrevious"]
): { text: string; tone: "improved" | "slower" | "same" | "neutral" } {
  if (!lv || lv.direction === "NOT_ENOUGH_DATA") {
    return {
      text: "More sessions needed to show improvement trend.",
      tone: "neutral",
    };
  }
  if (lv.direction === "IMPROVED") {
    const abs = lv.changeSeconds !== null ? Math.abs(lv.changeSeconds) : 0;
    return {
      text: `Improved by ${abs.toFixed(2)} seconds compared to previous session. Great progress!`,
      tone: "improved",
    };
  }
  if (lv.direction === "SLOWER") {
    const abs = lv.changeSeconds !== null ? Math.abs(lv.changeSeconds) : 0;
    return {
      text: `Timing increased by ${abs.toFixed(2)} seconds. Coach may review technique and pacing.`,
      tone: "slower",
    };
  }
  // SAME
  return {
    text: "Timing is consistent with the previous session.",
    tone: "same",
  };
}

// ============================================================
// Empty state (no children assigned)
// ============================================================
function NoChildrenState() {
  return (
    <Card className="bg-card border-aqua/30">
      <CardContent className="py-12 flex flex-col items-center text-center">
        <div className="rounded-full bg-aqua/10 p-4 mb-4">
          <HeartHandshake className="size-8 text-aqua" />
        </div>
        <h3 className="text-lg font-semibold">No children assigned yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Please ask your coach to grant access. Once your child is linked to
          your account, you&apos;ll see their progress here.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Summary Card (single stat tile)
// ============================================================
function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "aqua",
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "aqua" | "navy" | "emerald" | "amber" | "red";
  badge?: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    aqua: "bg-aqua/15 text-aqua",
    navy: "bg-navy/10 text-foreground",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    red: "bg-red-500/15 text-red-700 dark:text-red-300",
  };
  return (
    <div className="rounded-xl border bg-card p-4 hover:border-aqua/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "rounded-md p-2 shrink-0",
            accentMap[accent]
          )}
        >
          <Icon className="size-4" />
        </div>
        {badge}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold lp-timer-digits leading-tight">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

// ============================================================
// Summary Cards Block
// ============================================================
function SummaryCardsBlock({ data }: { data: ParentChildSummaryDTO }) {
  // Best time = first entry of bestTimes[] (already ordered best-first by API)
  const best = data.bestTimes?.[0] ?? null;

  // Improvement direction + delta
  const lv = data.latestVsPrevious;
  const dir = lv?.direction ?? "NOT_ENOUGH_DATA";
  const change = lv?.changeSeconds ?? null;

  let improvementIcon = TrendingUp;
  let improvementAccent: "aqua" | "emerald" | "red" | "amber" = "amber";
  let improvementBadge: React.ReactNode = null;

  if (dir === "IMPROVED") {
    improvementIcon = TrendingUp;
    improvementAccent = "emerald";
    improvementBadge = (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
        Improved
      </Badge>
    );
  } else if (dir === "SLOWER") {
    improvementIcon = TrendingDown;
    improvementAccent = "red";
    improvementBadge = (
      <Badge className="bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300">
        Slower
      </Badge>
    );
  } else if (dir === "SAME") {
    improvementIcon = TrendingUp;
    improvementAccent = "aqua";
    improvementBadge = (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        Same
      </Badge>
    );
  } else {
    improvementIcon = TrendingUp;
    improvementAccent = "amber";
    improvementBadge = (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        N/A
      </Badge>
    );
  }

  // Improvement value text — show change with sign
  let improvementValue = "—";
  if (change !== null) {
    const sign = change > 0 ? "+" : change < 0 ? "−" : "";
    improvementValue = `${sign}${Math.abs(change).toFixed(2)}s`;
  }

  // Latest time
  const ls = data.latestSession;
  const latestTime =
    ls?.resultText ??
    (ls && ls.elapsedSeconds !== null
      ? formatSeconds(ls.elapsedSeconds)
      : "—");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <SummaryCard
        icon={History}
        label="Total Sessions"
        value={data.totalSessions ?? 0}
        sub="Completed training sessions"
        accent="aqua"
      />
      <SummaryCard
        icon={Timer}
        label="Latest Time"
        value={latestTime}
        sub={
          data.latestSession
            ? `${data.latestSession.styleName} ${data.latestSession.distanceMeters}m`
            : "No session yet"
        }
        accent="navy"
      />
      <SummaryCard
        icon={Trophy}
        label="Best Time"
        value={best?.bestText ?? "—"}
        sub={
          best
            ? `${best.styleName} ${best.distanceMeters}m`
            : "No finished session"
        }
        accent="amber"
      />
      <SummaryCard
        icon={improvementIcon}
        label="Improvement"
        value={improvementValue}
        sub="vs previous session"
        accent={improvementAccent}
        badge={improvementBadge}
      />
    </div>
  );
}

// ============================================================
// Latest Session Callout
// ============================================================
function LatestSessionCallout({
  data,
}: {
  data: ParentChildSummaryDTO;
}) {
  const s = data.latestSession;
  if (!s) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-aqua" />
            Latest Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No training sessions have been recorded yet. Once your child
            completes a session with their coach, the latest performance will
            appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const time =
    s.resultText ??
    (s.elapsedSeconds !== null ? formatSeconds(s.elapsedSeconds) : "—");

  return (
    <Card className="bg-gradient-to-br from-aqua/10 to-navy/5 border-aqua/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-aqua" />
          Latest Performance
        </CardTitle>
        <CardDescription>
          Most recent recorded session for {data.swimmerName}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Session
            </div>
            <div className="font-semibold text-base mt-0.5 break-words">
              {s.sessionName}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatDateShort(s.sessionDate)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Style / Distance
            </div>
            <Badge className="mt-0.5 bg-aqua/15 text-aqua border-aqua/30">
              {s.styleName} • {s.distanceMeters}m
            </Badge>
          </div>
        </div>
        <div className="rounded-lg bg-card border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Result
          </div>
          <div className="text-2xl font-bold lp-timer-digits mt-0.5">
            {time}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Best recent performance:{" "}
          <span className="font-semibold text-foreground">
            {s.styleName} {s.distanceMeters}m
          </span>{" "}
          in{" "}
          <span className="font-semibold text-foreground">
            {time.toLowerCase().startsWith("dnf") ? time : time}
          </span>
          .
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Improvement Message Banner
// ============================================================
function ImprovementBanner({
  data,
}: {
  data: ParentChildSummaryDTO;
}) {
  const { text, tone } = improvementMessage(data.latestVsPrevious);

  const toneClass: Record<string, string> = {
    improved:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200",
    slower:
      "bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-200",
    same: "bg-aqua/10 border-aqua/30 text-foreground",
    neutral: "bg-muted border-border text-muted-foreground",
  };

  const Icon =
    tone === "improved"
      ? TrendingUp
      : tone === "slower"
      ? TrendingDown
      : Sparkles;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex items-start gap-3",
        toneClass[tone]
      )}
    >
      <Icon className="size-5 shrink-0 mt-0.5" />
      <div className="text-sm font-medium leading-relaxed">{text}</div>
    </div>
  );
}

// ============================================================
// Progress Trend Chart
// ============================================================
function ProgressTrendChart({ data }: { data: ParentChildSummaryDTO }) {
  const chartData = useMemo(
    () =>
      (data.trend ?? []).map((t) => ({
        date: formatDateShort(t.sessionDate),
        time: t.timeSeconds,
        styleName: t.styleName,
        distanceMeters: t.distanceMeters,
      })),
    [data.trend]
  );

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown className="size-4 text-aqua" />
          Progress Over Time
        </CardTitle>
        <CardDescription>
          Lower time = better. Each point is a finished session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <TrendingDown className="size-8 text-aqua/60 mb-2" />
            <p className="text-sm">Need more sessions to chart progress.</p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.85 0.02 220)"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  stroke="oklch(0.5 0.02 220)"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="oklch(0.5 0.02 220)"
                  tickFormatter={(v: number) => formatSeconds(v)}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(v: number) => [formatSeconds(v), "Time"]}
                  labelFormatter={(label: string, payload: any) => {
                    const p = payload?.[0]?.payload;
                    if (p) {
                      return `${label} — ${p.styleName} ${p.distanceMeters}m`;
                    }
                    return label;
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid oklch(0.85 0.02 220)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke={AQUA}
                  strokeWidth={3}
                  dot={{ r: 4, fill: AQUA }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Best Times Table
// ============================================================
function BestTimesCard({ data }: { data: ParentChildSummaryDTO }) {
  const best = data.bestTimes ?? [];
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="size-4 text-aqua" />
          Best Times
        </CardTitle>
        <CardDescription>
          Personal records by style and distance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {best.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Award className="size-8 text-aqua/60 mb-2" />
            <p className="text-sm">No best times recorded yet.</p>
          </div>
        ) : (
          <ScrollArea className="h-72 rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Best Time</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {best.map((b, i) => (
                  <TableRow key={`${b.styleId}-${b.distanceMeters}-${i}`}>
                    <TableCell className="font-medium">{b.styleName}</TableCell>
                    <TableCell className="text-right">{b.distanceMeters}m</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-aqua">
                      {b.bestText}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateShort(b.sessionDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Coach Recommendations
// ============================================================
function RecommendationsCard({
  data,
}: {
  data: ParentChildSummaryDTO;
}) {
  const recs = data.recommendations ?? [];
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-aqua" />
          Training Focus
        </CardTitle>
        <CardDescription>
          Coach-friendly guidance based on recent performance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {recs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <Sparkles className="size-8 text-aqua/60 mb-2" />
            <p className="text-sm">
              No specific recommendations yet. Keep attending sessions!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recs.map((r, i) => (
              <div
                key={i}
                className="rounded-xl border border-aqua/30 bg-aqua/5 p-4"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm text-foreground">
                    {r.whatHappened}
                  </div>
                  {r.category && (
                    <Badge className="bg-aqua/15 text-aqua border-aqua/30 text-[10px]">
                      {r.category.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  )}
                </div>
                {r.whatToTrainNext && r.whatToTrainNext.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {r.whatToTrainNext.map((t, j) => (
                      <li
                        key={j}
                        className="text-sm text-foreground/90 flex items-start gap-2"
                      >
                        <span className="text-aqua mt-1.5 size-1.5 rounded-full bg-aqua shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Lap Consistency Card
// ============================================================
function LapConsistencyCard({
  data,
}: {
  data: ParentChildSummaryDTO;
}) {
  const lc = data.lapConsistency;
  if (!lc) return null;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="size-4 text-aqua" />
          Lap Consistency
        </CardTitle>
        <CardDescription>
          How steady your child&apos;s lap splits are across the latest session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Avg Lap
            </div>
            <div className="text-lg font-bold lp-timer-digits mt-0.5">
              {lc.avgLap !== null ? formatSeconds(lc.avgLap) : "—"}
            </div>
          </div>
          <div className="rounded-lg border bg-emerald-500/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Fastest Lap
            </div>
            <div className="text-lg font-bold lp-timer-digits mt-0.5 text-emerald-700 dark:text-emerald-300">
              {lc.fastestLap !== null ? formatSeconds(lc.fastestLap) : "—"}
            </div>
          </div>
          <div className="rounded-lg border bg-red-500/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Slowest Lap
            </div>
            <div className="text-lg font-bold lp-timer-digits mt-0.5 text-red-700 dark:text-red-300">
              {lc.slowestLap !== null ? formatSeconds(lc.slowestLap) : "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Drop-off %
            </div>
            <div className="text-lg font-bold lp-timer-digits mt-0.5">
              {lc.dropOffPercent !== null
                ? `${lc.dropOffPercent.toFixed(1)}%`
                : "—"}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Endurance Drop
            </div>
            <div className="mt-0.5">
              {lc.enduranceDrop ? (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300">
                  Detected
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                  None
                </Badge>
              )}
            </div>
          </div>
        </div>

        {lc.enduranceDrop && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Endurance drop detected. Child may benefit from pacing and
              endurance sets.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Last 5 Sessions List
// ============================================================
function Last5SessionsCard({
  data,
}: {
  data: ParentChildSummaryDTO;
}) {
  const sessions = data.last5Sessions ?? [];
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-aqua" />
          Last 5 Sessions
        </CardTitle>
        <CardDescription>Recent training history.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <History className="size-8 text-aqua/60 mb-2" />
            <p className="text-sm">No sessions recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {sessions.map((s) => {
              const time =
                s.resultText ??
                (s.elapsedSeconds !== null
                  ? formatSeconds(s.elapsedSeconds)
                  : "—");
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 hover:bg-aqua/5 transition-colors"
                >
                  <div className="rounded-md bg-aqua/10 p-2 shrink-0">
                    <Timer className="size-4 text-aqua" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {s.sessionName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDateShort(s.sessionDate)}
                      </span>
                      <span>•</span>
                      <span>
                        {s.styleName} {s.distanceMeters}m
                      </span>
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-aqua text-sm shrink-0">
                    {time}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Loading Skeletons
// ============================================================
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

// ============================================================
// Child Summary Block — renders all sections for one child
// ============================================================
function ChildSummaryBlock({
  swimmerId,
  swimmerName,
}: {
  swimmerId: string;
  swimmerName: string;
}) {
  const { data, isLoading, isError, error, refetch } =
    useQuery<ParentChildSummaryDTO>({
      queryKey: ["parent", "child-summary", swimmerId],
      queryFn: () =>
        api.get<ParentChildSummaryDTO>(
          `/api/parent/children/${swimmerId}/summary`
        ),
      enabled: !!swimmerId,
    });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="py-12 flex flex-col items-center text-center">
          <AlertCircle className="size-8 text-red-500 mb-3" />
          <h3 className="text-base font-semibold">Couldn&apos;t load progress</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {(error as Error)?.message ||
              "Something went wrong. Please try again."}
          </p>
          <Button
            className="mt-4 bg-aqua text-white hover:bg-aqua/90"
            onClick={() => refetch()}
          >
            <Loader2 className="size-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Swimmer header card (age, gender) */}
      <Card className="bg-card border-aqua/30">
        <CardContent className="py-4 flex items-center gap-4 flex-wrap">
          <div className="rounded-full bg-aqua/15 p-3 shrink-0">
            <HeartHandshake className="size-6 text-aqua" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold">{swimmerName}</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-aqua/10 text-aqua border-aqua/30">
                {ageLabel(data.age)}
              </Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                {genderLabel(data.gender)}
              </Badge>
              <span className="flex items-center gap-1">
                <History className="size-3" />
                {data.totalSessions} session{data.totalSessions === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <SummaryCardsBlock data={data} />

      {/* Latest session callout */}
      <LatestSessionCallout data={data} />

      {/* Improvement message */}
      <ImprovementBanner data={data} />

      {/* Progress chart */}
      <ProgressTrendChart data={data} />

      {/* Best times + Recommendations side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BestTimesCard data={data} />
        <RecommendationsCard data={data} />
      </div>

      {/* Lap consistency (only if not null) */}
      <LapConsistencyCard data={data} />

      {/* Last 5 sessions */}
      <Last5SessionsCard data={data} />
    </div>
  );
}

// ============================================================
// Main view
// ============================================================
export function ParentDashboardView() {
  const user = useAppStore((s) => s.user);
  const [selectedSwimmerId, setSelectedSwimmerId] = useState<string>("");

  // Fetch the list of children linked to this parent
  const childrenQ = useQuery<ParentSwimmerDTO[]>({
    queryKey: ["parent", "children"],
    queryFn: () => api.get<ParentSwimmerDTO[]>("/api/parent/children"),
  });

  // Derived selected swimmer — auto-select first child if user hasn't picked yet.
  // Using a derived value (NOT setState in useEffect) to satisfy strict lint rules.
  const children = childrenQ.data ?? [];
  const activeChildren = children.filter((c) => c.isActive);
  const effectiveSelectedId =
    selectedSwimmerId ||
    (activeChildren.length > 0 ? activeChildren[0].swimmerId : "");
  const selectedChild =
    activeChildren.find((c) => c.swimmerId === effectiveSelectedId) ?? null;

  // Role safety: routing already restricts to PARENT, but be defensive.
  if (user && user.role !== "PARENT") {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md border-red-500/30 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="size-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              The Parent Portal is only available for Parent accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your role is{" "}
              <span className="font-mono font-semibold">{user.role}</span>.
              Contact an admin if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-aqua/15 p-2">
          <HeartHandshake className="size-5 text-aqua" />
        </div>
        <div>
          <h1 className="text-xl font-bold">My Child&apos;s Progress</h1>
          <p className="text-xs text-muted-foreground">
            Track your child&apos;s swimming journey.
          </p>
        </div>
      </div>

      {/* Body */}
      {childrenQ.isLoading ? (
        <DashboardSkeleton />
      ) : childrenQ.isError ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-12 flex flex-col items-center text-center">
            <AlertCircle className="size-8 text-red-500 mb-3" />
            <h3 className="text-base font-semibold">
              Couldn&apos;t load your children
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {(childrenQ.error as Error)?.message ||
                "Please try again in a moment."}
            </p>
            <Button
              className="mt-4 bg-aqua text-white hover:bg-aqua/90"
              onClick={() => childrenQ.refetch()}
            >
              <Loader2 className="size-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : activeChildren.length === 0 ? (
        <NoChildrenState />
      ) : (
        <>
          {/* Child selector — only when more than 1 active child */}
          {activeChildren.length > 1 && (
            <Card className="bg-card">
              <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-muted-foreground">
                  Viewing:
                </div>
                <Select
                  value={effectiveSelectedId}
                  onValueChange={(v) => setSelectedSwimmerId(v)}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Select child" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeChildren.map((c) => (
                      <SelectItem key={c.swimmerId} value={c.swimmerId}>
                        {c.swimmerName ?? "Unnamed swimmer"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Child summary block (renders all sections) */}
          {effectiveSelectedId && selectedChild && (
            <ChildSummaryBlock
              key={effectiveSelectedId}
              swimmerId={effectiveSelectedId}
              swimmerName={selectedChild.swimmerName ?? "Your child"}
            />
          )}
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-muted-foreground">
        <HeartHandshake className="size-3 text-aqua" />
        LanePulse Pro • Parent Portal
      </div>
    </div>
  );
}
