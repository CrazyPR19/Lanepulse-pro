"use client";

// LanePulse Pro - Analysis Dashboard (6 report tabs)
// Comparison rule: only compare same swimmer + same style + same distance.
// Never compare 50m with 100m, never compare Back Stroke with Free Style.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Crown,
  Gauge,
  Info,
  Lightbulb,
  Loader2,
  Medal,
  Sparkles,
  Target,
  Timer as TimerIcon,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Waves,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { formatSeconds } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import type {
  CurrentVsPreviousReport,
  GroupRankingRow,
  ImprovementReport,
  LapPerformanceReport,
  RecommendationReport,
  SwimmerDTO,
  SwimmingStyleDTO,
  SwimmerVsSwimmerReport,
  TrainingGroupDTO,
  TrainingSessionDTO,
} from "@/lib/types";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DISTANCES = [25, 50, 100, 200, 400, 800, 1500];
const AQUA = "#1f9fbf";
const NAVY = "#0b1f3a";

// ============================================================
// Shared lookup hooks
// ============================================================
function useSwimmers() {
  return useQuery<SwimmerDTO[]>({
    queryKey: ["swimmers", "active"],
    queryFn: () =>
      api.get<SwimmerDTO[]>("/api/swimmers?active=true").then((r) => r ?? []),
  });
}
function useStyles() {
  return useQuery<SwimmingStyleDTO[]>({
    queryKey: ["styles"],
    queryFn: () => api.get<SwimmingStyleDTO[]>("/api/styles").then((r) => r ?? []),
  });
}
function useGroups() {
  return useQuery<TrainingGroupDTO[]>({
    queryKey: ["groups", "active"],
    queryFn: () =>
      api.get<TrainingGroupDTO[]>("/api/groups?active=true").then((r) => r ?? []),
  });
}
function useSessions() {
  return useQuery<TrainingSessionDTO[]>({
    queryKey: ["sessions", "all"],
    queryFn: () => api.get<TrainingSessionDTO[]>("/api/sessions").then((r) => r ?? []),
  });
}

// ============================================================
// Shared small UI helpers
// ============================================================
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    IMPROVED: { cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300", label: "Improved" },
    SLOWER: { cls: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300", label: "Slower" },
    SAME: { cls: "bg-muted text-muted-foreground border-border", label: "Same" },
    NOT_ENOUGH_DATA: { cls: "bg-muted/60 text-muted-foreground border-border", label: "Not Enough Data" },
  };
  const entry = map[status] ?? map.NOT_ENOUGH_DATA;
  return (
    <Badge variant="outline" className={cn("border", entry.cls)}>
      {entry.label}
    </Badge>
  );
}

function ChangeDelta({
  seconds,
  invert = false,
}: {
  seconds: number | null;
  invert?: boolean;
}) {
  if (seconds === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  // For improvement: positive = faster = green. For change: negative = improved.
  const isImproved = invert ? seconds < 0 : seconds > 0;
  const isSame = seconds === 0;
  if (isSame) {
    return <span className="text-muted-foreground font-medium">0.00s</span>;
  }
  return (
    <span
      className={cn(
        "font-semibold",
        isImproved ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      )}
    >
      {seconds > 0 ? "+" : ""}
      {seconds.toFixed(2)}s
    </span>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-aqua" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
      <Info className="size-8 text-aqua/60 mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function LoaderBlock() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

// ============================================================
// Tab A: Swimmer Improvement Report
// ============================================================
function ImprovementTab() {
  const swimmers = useSwimmers();
  const styles = useStyles();
  const qc = useQueryClient();

  const [swimmerId, setSwimmerId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [distance, setDistance] = useState<string>("50");
  const [triggered, setTriggered] = useState(0);

  const { data, isFetching, error } = useQuery<ImprovementReport>({
    queryKey: ["analysis", "improvement", swimmerId, styleId, distance, triggered],
    queryFn: () =>
      api.get<ImprovementReport>(
        `/api/analysis/improvement?swimmerId=${swimmerId}&styleId=${styleId}&distanceMeters=${distance}`
      ),
    enabled: triggered > 0 && !!swimmerId && !!styleId,
    retry: false,
  });

  const chartData = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        date: new Date(t.sessionDate).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "2-digit",
        }),
        time: Number(t.timeSeconds.toFixed(2)),
      })),
    [data]
  );

  const canGenerate = !!swimmerId && !!styleId;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Swimmer Improvement Report"
        description="Compare a swimmer's previous best vs latest time for a specific style + distance. Same swimmer + same style + same distance only."
        icon={TrendingUp}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Swimmer</Label>
            <Select value={swimmerId} onValueChange={setSwimmerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select swimmer" />
              </SelectTrigger>
              <SelectContent>
                {(swimmers.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.swimmerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style</Label>
            <Select value={styleId} onValueChange={setStyleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {(styles.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.styleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distance</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-aqua text-white hover:bg-aqua/90"
              disabled={!canGenerate || isFetching}
              onClick={() => {
                setTriggered((n) => n + 1);
                setTimeout(
                  () =>
                    qc.invalidateQueries({
                      queryKey: ["analysis", "improvement"],
                    }),
                  0
                );
              }}
            >
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate
            </Button>
          </div>
        </div>
      </SectionCard>

      {triggered === 0 ? (
        <SectionCard title="Report" icon={BarChart3}>
          <EmptyState message="Select a swimmer, style and distance, then click Generate." />
        </SectionCard>
      ) : error ? (
        <SectionCard title="Report" icon={BarChart3}>
          <EmptyState message={(error as Error).message || "Failed to load report."} />
        </SectionCard>
      ) : isFetching || !data ? (
        <SectionCard title="Report" icon={BarChart3}>
          <LoaderBlock />
        </SectionCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Previous Best</div>
                <div className="text-2xl font-bold mt-1 lp-timer-digits">
                  {data.previousBestSeconds !== null
                    ? formatSeconds(data.previousBestSeconds)
                    : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Latest Time</div>
                <div className="text-2xl font-bold mt-1 lp-timer-digits">
                  {data.latestTimeSeconds !== null
                    ? formatSeconds(data.latestTimeSeconds)
                    : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Improvement</div>
                <div className="text-2xl font-bold mt-1 lp-timer-digits">
                  <ChangeDelta seconds={data.improvementSeconds} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.improvementPercent !== null
                    ? `${data.improvementPercent.toFixed(1)}%`
                    : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-2">
                  <StatusBadge status={data.status} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {data.swimmerName} • {data.styleName} • {data.distanceMeters}m
                </div>
              </CardContent>
            </Card>
          </div>

          <SectionCard
            title="Time Trend"
            description="Lower = better. Each point is a finished session."
            icon={TrendingDown}
          >
            {chartData.length === 0 ? (
              <EmptyState message="No trend data yet." />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.02 220)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 220)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="oklch(0.5 0.02 220)"
                      tickFormatter={(v: number) => formatSeconds(v)}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatSeconds(v), "Time"]}
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
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ============================================================
// Tab B: Current vs Previous Timing Report
// ============================================================
function CurrentVsPreviousTab() {
  const groups = useGroups();
  const styles = useStyles();

  const [groupId, setGroupId] = useState<string>("__all__");
  const [styleId, setStyleId] = useState<string>("");
  const [distance, setDistance] = useState<string>("");
  const [sortKey, setSortKey] = useState<"name" | "change" | "last">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const params = new URLSearchParams();
  if (groupId && groupId !== "__all__") params.set("groupId", groupId);
  if (styleId) params.set("styleId", styleId);
  if (distance) params.set("distanceMeters", distance);

  const { data, isLoading, error } = useQuery<CurrentVsPreviousReport[]>({
    queryKey: ["analysis", "current-vs-previous", groupId, styleId, distance],
    queryFn: () =>
      api.get<CurrentVsPreviousReport[]>(
        `/api/analysis/current-vs-previous?${params.toString()}`
      ),
    retry: false,
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.swimmerName.localeCompare(b.swimmerName);
      else if (sortKey === "change") {
        const av = a.changeSeconds ?? -Infinity;
        const bv = b.changeSeconds ?? -Infinity;
        cmp = av - bv;
      } else if (sortKey === "last") {
        const av = a.lastTimeSeconds ?? Infinity;
        const bv = b.lastTimeSeconds ?? Infinity;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortKey, sortDir]);

  function toggleSort(key: "name" | "change" | "last") {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Current vs Previous Timing Report"
        description="For each swimmer matching the filters, compare the last 2 finished sessions. Negative change = improved."
        icon={Gauge}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Group (optional)</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All groups</SelectItem>
                {(groups.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.groupName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style (optional)</Label>
            <Select value={styleId} onValueChange={setStyleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All styles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All styles</SelectItem>
                {(styles.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.styleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distance (optional)</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All distances" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All distances</SelectItem>
                {DISTANCES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Results" icon={BarChart3}>
        {error ? (
          <EmptyState message={(error as Error).message} />
        ) : isLoading ? (
          <LoaderBlock />
        ) : rows.length === 0 ? (
          <EmptyState message="No finished sessions match the current filters." />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto lp-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 font-medium hover:text-aqua"
                      onClick={() => toggleSort("name")}
                    >
                      Swimmer
                      {sortKey === "name" && (
                        <ChevronRight
                          className={cn(
                            "size-3 transition-transform",
                            sortDir === "asc" ? "-rotate-90" : "rotate-90"
                          )}
                        />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Last Time</TableHead>
                  <TableHead>Previous Time</TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center gap-1 font-medium hover:text-aqua"
                      onClick={() => toggleSort("change")}
                    >
                      Change
                      {sortKey === "change" && (
                        <ChevronRight
                          className={cn(
                            "size-3 transition-transform",
                            sortDir === "asc" ? "-rotate-90" : "rotate-90"
                          )}
                        />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>% Change</TableHead>
                  <TableHead>Direction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.swimmerId}>
                    <TableCell className="font-medium">{r.swimmerName}</TableCell>
                    <TableCell className="lp-timer-digits">
                      {r.lastTimeSeconds !== null ? formatSeconds(r.lastTimeSeconds) : "—"}
                    </TableCell>
                    <TableCell className="lp-timer-digits text-muted-foreground">
                      {r.previousTimeSeconds !== null
                        ? formatSeconds(r.previousTimeSeconds)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ChangeDelta seconds={r.changeSeconds} invert />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.changePercent !== null
                        ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.direction} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================
// Tab C: Swimmer vs Swimmer Comparison
// ============================================================
function MetricRow({
  label,
  a,
  b,
  lowerIsBetter = true,
}: {
  label: string;
  a: number | null;
  b: number | null;
  lowerIsBetter?: boolean;
}) {
  let winner: "A" | "B" | "tie" | "none" = "none";
  if (a !== null && b !== null) {
    if (a === b) winner = "tie";
    else if (lowerIsBetter) winner = a < b ? "A" : "B";
    else winner = a > b ? "A" : "B";
  }
  return (
    <div className="grid grid-cols-3 items-center gap-2 py-3 border-b last:border-0">
      <div className="text-left">
        <div
          className={cn(
            "font-bold lp-timer-digits text-lg",
            winner === "A" ? "text-aqua" : "text-foreground"
          )}
        >
          {a !== null ? formatSeconds(a) : "—"}
        </div>
        {winner === "A" && (
          <Badge className="mt-1 bg-aqua/15 text-aqua border-aqua/30">
            <Crown className="size-3" /> Winner
          </Badge>
        )}
      </div>
      <div className="text-center text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-right">
        <div
          className={cn(
            "font-bold lp-timer-digits text-lg",
            winner === "B" ? "text-aqua" : "text-foreground"
          )}
        >
          {b !== null ? formatSeconds(b) : "—"}
        </div>
        {winner === "B" && (
          <Badge className="mt-1 bg-aqua/15 text-aqua border-aqua/30">
            <Crown className="size-3" /> Winner
          </Badge>
        )}
      </div>
    </div>
  );
}

function SwimmerVsSwimmerTab() {
  const swimmers = useSwimmers();
  const styles = useStyles();

  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [distance, setDistance] = useState<string>("50");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const params = new URLSearchParams({
    a: aId,
    b: bId,
    styleId,
    distanceMeters: distance,
  });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const canFetch = !!aId && !!bId && !!styleId && aId !== bId;

  const { data, isLoading, error, isFetching, refetch } = useQuery<SwimmerVsSwimmerReport>({
    queryKey: ["analysis", "swimmer-vs-swimmer", aId, bId, styleId, distance, from, to],
    queryFn: () =>
      api.get<SwimmerVsSwimmerReport>(
        `/api/analysis/swimmer-vs-swimmer?${params.toString()}`
      ),
    enabled: canFetch,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <SectionCard
        title="Swimmer vs Swimmer Comparison"
        description="Compare two swimmers head-to-head over the same style and distance within a date range. Same style + same distance only."
        icon={Users}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Swimmer A</Label>
            <Select value={aId} onValueChange={setAId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick swimmer A" />
              </SelectTrigger>
              <SelectContent>
                {(swimmers.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.id === bId}>
                    {s.swimmerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Swimmer B</Label>
            <Select value={bId} onValueChange={setBId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick swimmer B" />
              </SelectTrigger>
              <SelectContent>
                {(swimmers.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.id === aId}>
                    {s.swimmerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style</Label>
            <Select value={styleId} onValueChange={setStyleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {(styles.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.styleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distance</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From (optional)</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To (optional)</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={!canFetch || isFetching}
          >
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </SectionCard>

      {!canFetch ? (
        <SectionCard title="Comparison" icon={BarChart3}>
          <EmptyState message="Pick two different swimmers, a style and a distance to compare." />
        </SectionCard>
      ) : error ? (
        <SectionCard title="Comparison" icon={BarChart3}>
          <EmptyState message={(error as Error).message} />
        </SectionCard>
      ) : isLoading || !data ? (
        <SectionCard title="Comparison" icon={BarChart3}>
          <LoaderBlock />
        </SectionCard>
      ) : (
        <SectionCard title="Head-to-Head" icon={Trophy}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border bg-aqua/10 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-aqua font-semibold">
                Swimmer A
              </div>
              <div className="font-bold text-base mt-0.5">
                {data.swimmerAName}
              </div>
            </div>
            <div className="rounded-lg border bg-navy/10 p-3 text-center">
              <div className="text-xs uppercase tracking-wide font-semibold">
                Swimmer B
              </div>
              <div className="font-bold text-base mt-0.5">
                {data.swimmerBName}
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card">
            <MetricRow label="Best Time" a={data.bestTimeA} b={data.bestTimeB} />
            <MetricRow label="Avg Time" a={data.avgTimeA} b={data.avgTimeB} />
            <MetricRow label="Latest Time" a={data.latestTimeA} b={data.latestTimeB} />
            <MetricRow
              label="Consistency (lower = more consistent)"
              a={data.consistencyA}
              b={data.consistencyB}
            />
            <MetricRow
              label="Lap Consistency (lower = steadier)"
              a={data.lapConsistencyA}
              b={data.lapConsistencyB}
            />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ============================================================
// Tab D: Group Ranking Report
// ============================================================
function GroupRankingTab() {
  const sessions = useSessions();

  const [sessionId, setSessionId] = useState<string>("");

  const { data, isLoading, error } = useQuery<GroupRankingRow[]>({
    queryKey: ["analysis", "group-ranking", sessionId],
    queryFn: () =>
      api.get<GroupRankingRow[]>(`/api/analysis/group-ranking?sessionId=${sessionId}`),
    enabled: !!sessionId,
    retry: false,
  });

  const best = (data ?? []).find((r) => r.isBest) ?? null;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Group Ranking Report"
        description="Rank the finished swimmers within a single session from fastest to slowest."
        icon={Medal}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {(sessions.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sessionName} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {best && (
        <Card className="bg-gradient-to-r from-aqua/15 to-aqua/5 border-aqua/30">
          <CardContent className="py-5 flex items-center gap-4">
            <Trophy className="size-10 text-aqua shrink-0" />
            <div>
              <div className="text-xs uppercase tracking-wide text-aqua font-semibold">
                Best Performer
              </div>
              <div className="text-xl font-bold">{best.swimmerName ?? "—"}</div>
              <div className="text-sm text-muted-foreground">
                Lane {best.laneNo} • {formatSeconds(best.elapsedSeconds ?? 0)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SectionCard title="Rankings" icon={BarChart3}>
        {!sessionId ? (
          <EmptyState message="Select a session to view its ranking." />
        ) : error ? (
          <EmptyState message={(error as Error).message} />
        ) : isLoading ? (
          <LoaderBlock />
        ) : (data ?? []).length === 0 ? (
          <EmptyState message="No finished lanes in this session." />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto lp-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead className="w-16">Lane</TableHead>
                  <TableHead>Swimmer</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Gap from 1st</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow
                    key={`${r.laneNo}-${r.swimmerId ?? "x"}`}
                    className={cn(
                      r.isBest && "bg-aqua/10 hover:bg-aqua/15"
                    )}
                  >
                    <TableCell>
                      <div
                        className={cn(
                          "inline-flex items-center justify-center size-7 rounded-full text-xs font-bold",
                          r.rank === 1
                            ? "bg-aqua text-white"
                            : r.rank === 2
                            ? "bg-muted text-foreground"
                            : r.rank === 3
                            ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                            : "bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {r.rank}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{r.laneNo}</TableCell>
                    <TableCell>{r.swimmerName ?? "—"}</TableCell>
                    <TableCell className="lp-timer-digits font-semibold">
                      {r.elapsedSeconds !== null
                        ? formatSeconds(r.elapsedSeconds)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.gapFromFirst !== null && r.gapFromFirst > 0
                        ? `+${r.gapFromFirst.toFixed(2)}s`
                        : r.gapFromFirst === 0
                        ? "—"
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================
// Tab E: Lap Performance Report
// ============================================================
function LapPerformanceTab() {
  const sessions = useSessions();
  const swimmers = useSwimmers();
  const styles = useStyles();

  const [mode, setMode] = useState<"session" | "swimmer">("session");
  const [sessionId, setSessionId] = useState<string>("");
  const [swimmerId, setSwimmerId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [distance, setDistance] = useState<string>("50");

  const sessionEnabled = mode === "session" && !!sessionId;
  const swimmerEnabled =
    mode === "swimmer" && !!swimmerId && !!styleId;

  const sessionParams = new URLSearchParams({ sessionId });
  const swimmerParams = new URLSearchParams({
    swimmerId,
    styleId,
    distanceMeters: distance,
  });

  const sessionQ = useQuery<LapPerformanceReport>({
    queryKey: ["analysis", "lap-performance", "session", sessionId],
    queryFn: () =>
      api.get<LapPerformanceReport>(
        `/api/analysis/lap-performance?${sessionParams.toString()}`
      ),
    enabled: sessionEnabled,
    retry: false,
  });
  const swimmerQ = useQuery<LapPerformanceReport>({
    queryKey: ["analysis", "lap-performance", "swimmer", swimmerId, styleId, distance],
    queryFn: () =>
      api.get<LapPerformanceReport>(
        `/api/analysis/lap-performance?${swimmerParams.toString()}`
      ),
    enabled: swimmerEnabled,
    retry: false,
  });

  const data = mode === "session" ? sessionQ.data : swimmerQ.data;
  const isLoading = mode === "session" ? sessionQ.isLoading : swimmerQ.isLoading;
  const error = mode === "session" ? sessionQ.error : swimmerQ.error;

  const barData = useMemo(
    () =>
      (data?.laps ?? []).map((l) => ({
        lapNo: `Lap ${l.lapNo}`,
        time: Number(l.lapTimeSeconds.toFixed(2)),
      })),
    [data]
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Lap Performance Report"
        description="Analyze lap-by-lap splits — fastest lap, slowest lap, drop-off and endurance. Choose a session OR (swimmer + style + distance)."
        icon={TimerIcon}
      >
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === "session" ? "default" : "outline"}
            className={
              mode === "session" ? "bg-aqua text-white hover:bg-aqua/90" : ""
            }
            onClick={() => setMode("session")}
          >
            By Session
          </Button>
          <Button
            variant={mode === "swimmer" ? "default" : "outline"}
            className={
              mode === "swimmer" ? "bg-aqua text-white hover:bg-aqua/90" : ""
            }
            onClick={() => setMode("swimmer")}
          >
            By Swimmer + Style + Distance
          </Button>
        </div>

        {mode === "session" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Session</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {(sessions.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sessionName} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Swimmer</Label>
              <Select value={swimmerId} onValueChange={setSwimmerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select swimmer" />
                </SelectTrigger>
                <SelectContent>
                  {(swimmers.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.swimmerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Style</Label>
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {(styles.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.styleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Distance</Label>
              <Select value={distance} onValueChange={setDistance}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISTANCES.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}m
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </SectionCard>

      {(mode === "session" ? sessionEnabled : swimmerEnabled) === false ? (
        <SectionCard title="Lap Report" icon={BarChart3}>
          <EmptyState
            message={
              mode === "session"
                ? "Pick a session to analyze lap splits."
                : "Pick swimmer, style and distance to analyze lap splits."
            }
          />
        </SectionCard>
      ) : error ? (
        <SectionCard title="Lap Report" icon={BarChart3}>
          <EmptyState message={(error as Error).message} />
        </SectionCard>
      ) : isLoading || !data ? (
        <SectionCard title="Lap Report" icon={BarChart3}>
          <LoaderBlock />
        </SectionCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Fastest Lap</div>
                <div className="text-xl font-bold mt-1 lp-timer-digits text-aqua">
                  {data.fastestLap ? formatSeconds(data.fastestLap.lapTimeSeconds) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.fastestLap ? `Lap #${data.fastestLap.lapNo}` : ""}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Slowest Lap</div>
                <div className="text-xl font-bold mt-1 lp-timer-digits text-red-600 dark:text-red-400">
                  {data.slowestLap ? formatSeconds(data.slowestLap.lapTimeSeconds) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.slowestLap ? `Lap #${data.slowestLap.lapNo}` : ""}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Average Lap</div>
                <div className="text-xl font-bold mt-1 lp-timer-digits">
                  {data.avgLap !== null ? formatSeconds(data.avgLap) : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Drop-off %</div>
                <div className="text-xl font-bold mt-1 lp-timer-digits">
                  {data.dropOffPercent !== null
                    ? `${data.dropOffPercent.toFixed(1)}%`
                    : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Consistency Score</div>
                <div className="text-xl font-bold mt-1 lp-timer-digits">
                  {data.consistencyScore !== null
                    ? `${data.consistencyScore.toFixed(1)}%`
                    : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">lower = steadier</div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Endurance Drop</div>
                <div className="mt-2">
                  {data.enduranceDrop ? (
                    <Badge className="bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300">
                      <TrendingDown className="size-3" /> Detected
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                      <CheckCircle2 className="size-3" /> None
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {data.swimmerName}
                </div>
              </CardContent>
            </Card>
          </div>

          <SectionCard title="Lap Splits" icon={BarChart3}>
            <div className="max-h-72 overflow-y-auto lp-scroll rounded-md border mb-4">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Lap No</TableHead>
                    <TableHead>Lap Time</TableHead>
                    <TableHead>Cumulative</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.laps.map((l) => {
                    const isFastest =
                      data.fastestLap && l.lapNo === data.fastestLap.lapNo;
                    const isSlowest =
                      data.slowestLap && l.lapNo === data.slowestLap.lapNo;
                    return (
                      <TableRow key={l.lapNo}>
                        <TableCell className="font-medium">{l.lapNo}</TableCell>
                        <TableCell
                          className={cn(
                            "lp-timer-digits",
                            isFastest && "text-aqua font-bold",
                            isSlowest && "text-red-600 dark:text-red-400 font-bold"
                          )}
                        >
                          {formatSeconds(l.lapTimeSeconds)}
                        </TableCell>
                        <TableCell className="lp-timer-digits text-muted-foreground">
                          {formatSeconds(l.cumulativeSeconds)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {barData.length > 0 && (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.85 0.02 220)" />
                    <XAxis dataKey="lapNo" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 220)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="oklch(0.5 0.02 220)"
                      tickFormatter={(v: number) => formatSeconds(v)}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatSeconds(v), "Lap Time"]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid oklch(0.85 0.02 220)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="time" fill={AQUA} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ============================================================
// Tab F: Training Recommendations
// ============================================================
const CATEGORY_META: Record<
  RecommendationReport["category"],
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  IMPROVED: {
    label: "Improved",
    cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    icon: TrendingUp,
  },
  SLOWER: {
    label: "Slower",
    cls: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
    icon: TrendingDown,
  },
  CONSISTENT: {
    label: "Consistent",
    cls: "bg-aqua/15 text-aqua border-aqua/30",
    icon: Target,
  },
  FAST_START_DROP: {
    label: "Fast Start Drop",
    cls: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
    icon: Gauge,
  },
  ENDURANCE_DROP: {
    label: "Endurance Drop",
    cls: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
    icon: TrendingDown,
  },
  NOT_ENOUGH_DATA: {
    label: "Not Enough Data",
    cls: "bg-muted text-muted-foreground border-border",
    icon: Info,
  },
};

function RecommendationsTab() {
  const swimmers = useSwimmers();
  const styles = useStyles();
  const qc = useQueryClient();

  const [swimmerId, setSwimmerId] = useState<string>("");
  const [styleId, setStyleId] = useState<string>("");
  const [distance, setDistance] = useState<string>("50");
  const [triggered, setTriggered] = useState(0);

  const canGenerate = !!swimmerId && !!styleId;

  const { data, isFetching, error } = useQuery<RecommendationReport & { performanceNoteId?: string }>({
    queryKey: ["analysis", "recommendations", swimmerId, styleId, distance, triggered],
    queryFn: () =>
      api.get<RecommendationReport & { performanceNoteId?: string }>(
        `/api/analysis/recommendations?swimmerId=${swimmerId}&styleId=${styleId}&distanceMeters=${distance}`
      ),
    enabled: triggered > 0 && canGenerate,
    retry: false,
  });

  const meta = data ? CATEGORY_META[data.category] : null;
  const CatIcon = meta?.icon ?? Sparkles;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Training Recommendations"
        description="Smart coaching analysis based on the swimmer's history. Generates a coach-friendly note with what happened, why, and what to train next."
        icon={Lightbulb}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Swimmer</Label>
            <Select value={swimmerId} onValueChange={setSwimmerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select swimmer" />
              </SelectTrigger>
              <SelectContent>
                {(swimmers.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.swimmerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style</Label>
            <Select value={styleId} onValueChange={setStyleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {(styles.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.styleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distance</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCES.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-aqua text-white hover:bg-aqua/90"
              disabled={!canGenerate || isFetching}
              onClick={() => {
                setTriggered((n) => n + 1);
                setTimeout(
                  () =>
                    qc.invalidateQueries({
                      queryKey: ["analysis", "recommendations"],
                    }),
                  0
                );
                toast.success("Generating recommendation…");
              }}
            >
              {isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate Recommendation
            </Button>
          </div>
        </div>
      </SectionCard>

      {triggered === 0 ? (
        <SectionCard title="Coach Note" icon={ClipboardList}>
          <EmptyState message="Pick a swimmer, style and distance, then click Generate Recommendation." />
        </SectionCard>
      ) : error ? (
        <SectionCard title="Coach Note" icon={ClipboardList}>
          <EmptyState message={(error as Error).message} />
        </SectionCard>
      ) : isFetching || !data ? (
        <SectionCard title="Coach Note" icon={ClipboardList}>
          <LoaderBlock />
        </SectionCard>
      ) : (
        <Card className="border-aqua/30 bg-gradient-to-br from-aqua/5 via-card to-card">
          <CardHeader>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-aqua/15 p-2">
                  <CatIcon className="size-5 text-aqua" />
                </div>
                <div>
                  <CardTitle className="text-lg">Coach Note</CardTitle>
                  <CardDescription>
                    {data.swimmerName} • {data.styleName} • {data.distanceMeters}m
                  </CardDescription>
                </div>
              </div>
              <div className="ml-auto">
                {meta && (
                  <Badge variant="outline" className={cn("border", meta.cls)}>
                    <CatIcon className="size-3" /> {meta.label}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-aqua">
                <Info className="size-4" /> What Happened
              </h3>
              <p className="text-sm leading-relaxed">{data.whatHappened}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-aqua">
                <Lightbulb className="size-4" /> Why It May Be Happening
              </h3>
              <ul className="space-y-1.5">
                {data.whyItMayHappen.map((w, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-aqua mt-1.5 size-1.5 rounded-full bg-aqua shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-aqua">
                <Target className="size-4" /> What to Train Next
              </h3>
              <ul className="space-y-1.5">
                {data.whatToTrainNext.map((t, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <CheckCircle2 className="size-4 text-aqua mt-0.5 shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>

            {data.performanceNoteId && (
              <div className="text-[11px] text-muted-foreground pt-2 border-t">
                Saved as performance note {data.performanceNoteId.slice(0, 8)}…
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Main view
// ============================================================
export function AnalysisView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-aqua/15 p-2">
          <BarChart3 className="size-5 text-aqua" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Analysis & Reports</h1>
          <p className="text-xs text-muted-foreground">
            Same swimmer + same style + same distance only. Lower time = better.
          </p>
        </div>
      </div>

      <Tabs defaultValue="improvement" className="w-full">
        <ScrollArea className="w-full">
          <TabsList className="flex w-max h-auto">
            <TabsTrigger value="improvement">
              <TrendingUp className="size-3.5" /> Improvement
            </TabsTrigger>
            <TabsTrigger value="cvp">
              <Gauge className="size-3.5" /> Current vs Previous
            </TabsTrigger>
            <TabsTrigger value="svs">
              <Users className="size-3.5" /> Swimmer vs Swimmer
            </TabsTrigger>
            <TabsTrigger value="ranking">
              <Medal className="size-3.5" /> Group Ranking
            </TabsTrigger>
            <TabsTrigger value="laps">
              <TimerIcon className="size-3.5" /> Lap Performance
            </TabsTrigger>
            <TabsTrigger value="recommendations">
              <Lightbulb className="size-3.5" /> Recommendations
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="improvement">
          <ImprovementTab />
        </TabsContent>
        <TabsContent value="cvp">
          <CurrentVsPreviousTab />
        </TabsContent>
        <TabsContent value="svs">
          <SwimmerVsSwimmerTab />
        </TabsContent>
        <TabsContent value="ranking">
          <GroupRankingTab />
        </TabsContent>
        <TabsContent value="laps">
          <LapPerformanceTab />
        </TabsContent>
        <TabsContent value="recommendations">
          <RecommendationsTab />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-muted-foreground">
        <Waves className="size-3 text-aqua" />
        LanePulse Pro • Smart Analysis
      </div>
    </div>
  );
}
