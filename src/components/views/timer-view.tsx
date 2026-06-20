"use client";

// LanePulse Pro - Timer View (Fast Timing Console)
// DEFAULT screen per spec. Includes Finish Capture Mode + Lap Capture Mode + bulk controls + next heat.

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTimerStore, useTick, liveElapsedMs } from "@/lib/store";
import { api } from "@/lib/api-client";
import type {
  SwimmingStyleDTO,
  TrainingGroupDTO,
  GroupMemberDTO,
  LiveLaneState,
  LaneStatus,
  TimerMode,
} from "@/lib/types";
import { POOL_LANES, formatMs, buildSessionName } from "@/lib/helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Square,
  RotateCcw,
  Flag,
  Timer as TimerIcon,
  LayoutGrid,
  Zap,
  Save,
  ChevronRight,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Waves,
  FastForward,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_COLORS: Record<LaneStatus, string> = {
  IDLE: "bg-muted text-muted-foreground",
  READY: "bg-blue-100 text-blue-700 border border-blue-300",
  RUNNING: "bg-aqua text-white lp-running-pulse",
  FINISHED: "bg-green-600 text-white",
  DNF: "bg-red-500 text-white",
};

const STATUS_LABEL: Record<LaneStatus, string> = {
  IDLE: "Idle",
  READY: "Ready",
  RUNNING: "Running",
  FINISHED: "Finished",
  DNF: "DNF",
};

export function TimerView() {
  const tick = useTick(50); // re-render every 50ms for live timers

  const {
    selectedGroupId,
    selectedGroupName,
    loadedGroupId,
    loadedGroupName,
    nextGroupId,
    nextGroupName,
    meta,
    lanes,
    mode,
    dirty,
    setSelectedGroup,
    setNextGroup,
    setMeta,
    setMode,
    loadSelectedGroup,
    loadNextGroup,
    startLane,
    stopLane,
    lapLane,
    resetLane,
    startAllReady,
    stopAllRunning,
    resetAll,
    markSaved,
    clearAll,
  } = useTimerStore();

  const [styles, setStyles] = useState<SwimmingStyleDTO[]>([]);
  const [groups, setGroups] = useState<TrainingGroupDTO[]>([]);
  const [saving, setSaving] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);

  // Load styles + groups
  useEffect(() => {
    api.get<SwimmingStyleDTO[]>("/api/styles").then(setStyles).catch(() => {});
    api.get<TrainingGroupDTO[]>("/api/groups?active=true").then(setGroups).catch(() => {});
  }, []);

  // Auto-set style name when styleId changes
  useEffect(() => {
    if (meta.styleId && styles.length) {
      const s = styles.find((x) => x.id === meta.styleId);
      if (s && s.styleName !== meta.styleName) {
        setMeta({ styleName: s.styleName });
      }
    }
  }, [meta.styleId, styles, meta.styleName, setMeta]);

  // Load selected group members into the board
  const handleLoadSelectedGroup = useCallback(async () => {
    if (!selectedGroupId) {
      toast.error("Select a group first");
      return;
    }
    try {
      const grp = await api.get<{ members: GroupMemberDTO[] }>(
        `/api/groups/${selectedGroupId}`
      );
      loadSelectedGroup(grp.members);
      toast.success(`Loaded group: ${selectedGroupName}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to load group");
    }
  }, [selectedGroupId, selectedGroupName, loadSelectedGroup]);

  // Save current session
  const handleSaveSession = useCallback(
    async (opts?: { thenLoadNext?: boolean }) => {
      if (!meta.styleId) {
        toast.error("Select a swimming style");
        return;
      }
      if (!loadedGroupId) {
        toast.error("No group is loaded on the timing board");
        return;
      }
      // Require at least one finished lane
      const hasFinished = lanes.some((l) => l.status === "FINISHED");
      if (!hasFinished) {
        toast.error("No finished lanes to save. Stop at least one lane first.");
        return;
      }
      setSaving(true);
      try {
        const payload = {
          sessionName:
            meta.sessionName ||
            buildSessionName(
              meta.styleName,
              meta.distanceMeters,
              loadedGroupName || "Group",
              new Date(meta.sessionDate)
            ),
          sessionDate: meta.sessionDate,
          styleId: meta.styleId,
          distanceMeters: meta.distanceMeters,
          groupId: loadedGroupId,
          remarks: meta.remarks,
          status: "COMPLETED" as const,
          sessionStartTime: meta.sessionStartTime || null,
          sessionEndTime: new Date().toISOString(),
          lanes: lanes
            .filter((l) => l.swimmerId || l.status === "FINISHED")
            .map((l) => ({
              laneNo: l.laneNo,
              swimmerId: l.swimmerId,
              groupId: loadedGroupId,
              startTime:
                l.startedAt !== null
                  ? new Date(l.startedAt).toISOString()
                  : null,
              stopTime:
                l.stoppedAt !== null
                  ? new Date(l.stoppedAt).toISOString()
                  : null,
              elapsedSeconds:
                l.status === "FINISHED"
                  ? liveElapsedMs(l) / 1000
                  : null,
              resultText:
                l.status === "FINISHED"
                  ? formatMs(liveElapsedMs(l))
                  : l.status === "DNF"
                  ? "DNF"
                  : null,
              status: l.status,
              laps: l.laps.map((lap) => ({
                lapNo: lap.lapNo,
                lapTimeSeconds: lap.lapMs / 1000,
                lapTimeText: formatMs(lap.lapMs),
                cumulativeSeconds: lap.cumulativeMs / 1000,
              })),
            })),
        };
        await api.post("/api/sessions", payload);
        markSaved();
        toast.success("Session saved successfully!");

        if (opts?.thenLoadNext) {
          if (!nextGroupId) {
            toast.error("No next group selected");
            return;
          }
          const nextGrp = await api.get<{ members: GroupMemberDTO[] }>(
            `/api/groups/${nextGroupId}`
          );
          loadNextGroup(nextGrp.members);
          toast.success(`Loaded next group: ${nextGroupName}`);
        } else {
          clearAll();
        }
      } catch (e: any) {
        toast.error(e.message || "Failed to save session");
      } finally {
        setSaving(false);
      }
    },
    [
      meta,
      lanes,
      loadedGroupId,
      loadedGroupName,
      nextGroupId,
      nextGroupName,
      markSaved,
      clearAll,
      loadNextGroup,
    ]
  );

  const stats = useMemo(() => {
    const running = lanes.filter((l) => l.status === "RUNNING").length;
    const finished = lanes.filter((l) => l.status === "FINISHED").length;
    const ready = lanes.filter((l) => l.status === "READY").length;
    return { running, finished, ready };
  }, [lanes]);

  const hasRunning = stats.running > 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TimerIcon className="size-5 text-aqua" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Fast Timing Console
          </h1>
          {dirty && (
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
              <AlertTriangle className="size-3 mr-1" /> Unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ModeButton
            active={mode === "console"}
            onClick={() => setMode("console")}
            icon={LayoutGrid}
            label="Console"
          />
          <ModeButton
            active={mode === "finish"}
            onClick={() => setMode("finish")}
            icon={Flag}
            label="Finish"
          />
          <ModeButton
            active={mode === "lap"}
            onClick={() => setMode("lap")}
            icon={Zap}
            label="Lap"
          />
        </div>
      </div>

      {/* Session setup + status panel (collapsible on mobile) */}
      <Card className="border-aqua/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Waves className="size-4 text-aqua shrink-0" /> Session Setup & Status
            {loadedGroupId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSetupCollapsed((c) => !c)}
                className="ml-auto h-7 px-2 text-xs"
              >
                {setupCollapsed ? (
                  <>
                    <ChevronDown className="size-3.5" /> Expand
                  </>
                ) : (
                  <>
                    <ChevronUp className="size-3.5" /> Collapse
                  </>
                )}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        {!setupCollapsed && (
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Session Date — full width on mobile */}
            <div className="space-y-1.5 w-full min-w-0">
              <Label className="text-xs text-muted-foreground">Session Date</Label>
              <Input
                type="date"
                value={meta.sessionDate.slice(0, 10)}
                onChange={(e) =>
                  setMeta({
                    sessionDate: new Date(e.target.value).toISOString(),
                  })
                }
                className="h-11 w-full"
              />
            </div>
            {/* Style — full width on mobile */}
            <div className="space-y-1.5 w-full min-w-0">
              <Label className="text-xs text-muted-foreground">Style</Label>
              <Select
                value={meta.styleId}
                onValueChange={(v) => setMeta({ styleId: v })}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select style" />
                </SelectTrigger>
                <SelectContent>
                  {styles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.styleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Distance — full width on mobile */}
            <div className="space-y-1.5 w-full min-w-0">
              <Label className="text-xs text-muted-foreground">Distance (m)</Label>
              <Select
                value={String(meta.distanceMeters)}
                onValueChange={(v) => setMeta({ distanceMeters: Number(v) })}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200, 400, 800, 1500].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}m
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Session Name — full width on mobile, spans 2 on desktop */}
            <div className="space-y-1.5 w-full min-w-0 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Session Name</Label>
              <Input
                value={meta.sessionName}
                onChange={(e) => setMeta({ sessionName: e.target.value })}
                placeholder="Auto-generated if blank"
                className="h-11 w-full"
              />
            </div>
            {/* Select Group — full width on mobile */}
            <div className="space-y-1.5 w-full min-w-0">
              <Label className="text-xs text-muted-foreground">Select Group</Label>
              <Select
                value={selectedGroupId || ""}
                onValueChange={(v) => {
                  const g = groups.find((x) => x.id === v);
                  setSelectedGroup(v, g?.groupName || null);
                }}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Choose group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.groupName}
                      {g.memberCount ? ` (${g.memberCount})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Load Selected Group button — full width, large touch target */}
            <div className="space-y-1.5 w-full min-w-0 sm:col-span-2 lg:col-span-3">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Button
                onClick={handleLoadSelectedGroup}
                disabled={!selectedGroupId}
                className="w-full h-12 bg-navy hover:bg-navy/90 text-base"
              >
                <Layers className="size-4" /> Load Selected Group
              </Button>
            </div>
          </CardContent>
        )}

        {/* Status panel — always visible (even when setup collapsed) */}
        <div className="px-4 sm:px-6 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 border-t pt-3 mt-1">
          <StatusChip
            label="Selected Group"
            value={selectedGroupName || "—"}
            color="text-foreground"
          />
          <StatusChip
            label="Loaded Group"
            value={loadedGroupName || "—"}
            color="text-aqua font-semibold"
          />
          <StatusChip label="Style" value={meta.styleName || "—"} />
          <StatusChip label="Distance" value={`${meta.distanceMeters}m`} />
          <StatusChip
            label="Session Status"
            value={meta.status}
            color={
              meta.status === "COMPLETED"
                ? "text-green-600 font-semibold"
                : meta.status === "RUNNING"
                ? "text-aqua font-semibold"
                : "text-muted-foreground"
            }
          />
        </div>
      </Card>

      {/* Bulk controls — mobile: stacked full-width, desktop: inline */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
        <Button
          onClick={startAllReady}
          disabled={stats.ready === 0}
          className="bg-green-600 hover:bg-green-700 text-white h-12 w-full sm:w-auto"
        >
          <Play className="size-4" /> Start All ({stats.ready})
        </Button>
        <Button
          onClick={stopAllRunning}
          disabled={stats.running === 0}
          variant="destructive"
          className="h-12 w-full sm:w-auto"
        >
          <Square className="size-4" /> Stop All ({stats.running})
        </Button>
        <Button
          onClick={resetAll}
          variant="outline"
          className="h-12 w-full sm:w-auto"
          disabled={!dirty}
        >
          <RotateCcw className="size-4" /> Reset
        </Button>
        <div className="hidden sm:flex-1" />
        <Button
          onClick={() => handleSaveSession()}
          disabled={saving || stats.finished === 0}
          className="bg-aqua hover:bg-aqua/90 text-white h-12 w-full sm:w-auto col-span-2 sm:col-span-1"
        >
          <Save className="size-4" /> {saving ? "Saving…" : "Complete & Save"}
        </Button>
      </div>

      {/* Main mode area */}
      {mode === "console" && (
        <ConsoleView lanes={lanes} tick={tick} hasRunning={hasRunning}
          onStart={startLane} onStop={stopLane} onLap={lapLane} onReset={resetLane} />
      )}
      {mode === "finish" && (
        <FinishCaptureView lanes={lanes} tick={tick} onFinish={stopLane} />
      )}
      {mode === "lap" && (
        <LapCaptureView lanes={lanes} tick={tick} onLap={lapLane} />
      )}

      {/* Next Heat / Next Group Quick Start */}
      <Card className="border-navy/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FastForward className="size-4 text-navy" /> Next Heat / Next Group
            Quick Start
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[180px] flex-1">
            <Label className="text-xs text-muted-foreground">
              Next Group (separate from selected)
            </Label>
            <Select
              value={nextGroupId || ""}
              onValueChange={(v) => {
                const g = groups.find((x) => x.id === v);
                setNextGroup(v, g?.groupName || null);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose next group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.groupName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              if (!nextGroupId) {
                toast.error("Select a next group first");
                return;
              }
              if (dirty && stats.finished > 0) {
                toast.message("You have unsaved timings. Save & Load Next instead.");
                return;
              }
              try {
                const g = await api.get<{ members: GroupMemberDTO[] }>(
                  `/api/groups/${nextGroupId}`
                );
                loadNextGroup(g.members);
                toast.success(`Loaded next group: ${nextGroupName}`);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            disabled={!nextGroupId}
            className="h-9"
          >
            <Layers className="size-3.5" /> Load Next Group
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!nextGroupId || saving || stats.finished === 0}
                className="bg-navy hover:bg-navy/90 text-white h-9"
              >
                <Save className="size-3.5" /> Save Current, Then Load Next
                <ChevronRight className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Save current session & load next group?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will save the current session as COMPLETED and immediately
                  load the next group <strong>{nextGroupName}</strong> with a fresh
                  timing board. A new auto-named session will start.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => handleSaveSession({ thenLoadNext: true })}
                  className="bg-navy hover:bg-navy/90"
                >
                  Save & Load Next
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="text-xs text-muted-foreground ml-auto">
            Auto-name: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
              Style - Xm - Group - yyyy-mm-dd HH:mm
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Mode buttons
// ============================================================

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={cn(
        "h-9",
        active && "bg-aqua hover:bg-aqua/90 text-white"
      )}
    >
      <Icon className="size-3.5" /> {label}
    </Button>
  );
}

function StatusChip({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-sm truncate", color)}>{value}</span>
    </div>
  );
}

// ============================================================
// CONSOLE VIEW — compact 12-lane table
// ============================================================

function ConsoleView({
  lanes,
  tick,
  hasRunning,
  onStart,
  onStop,
  onLap,
  onReset,
}: {
  lanes: LiveLaneState[];
  tick: number;
  hasRunning: boolean;
  onStart: (n: number) => void;
  onStop: (n: number) => void;
  onLap: (n: number) => void;
  onReset: (n: number) => void;
}) {
  // tick is used implicitly to trigger re-render
  void tick;
  void hasRunning;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header row (hidden on mobile) */}
        <div className="hidden md:grid grid-cols-[48px_1fr_90px_120px_140px_120px] gap-2 px-3 py-2 bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
          <div>Lane</div>
          <div>Swimmer</div>
          <div>Status</div>
          <div>Live Time</div>
          <div className="text-center">Controls</div>
          <div>Last Lap</div>
        </div>
        <div className="divide-y">
          {lanes.map((lane) => (
            <ConsoleLaneRow
              key={lane.laneNo}
              lane={lane}
              onStart={onStart}
              onStop={onStop}
              onLap={onLap}
              onReset={onReset}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConsoleLaneRow({
  lane,
  onStart,
  onStop,
  onLap,
  onReset,
}: {
  lane: LiveLaneState;
  onStart: (n: number) => void;
  onStop: (n: number) => void;
  onLap: (n: number) => void;
  onReset: (n: number) => void;
}) {
  const elapsed = liveElapsedMs(lane);
  const isEmpty = !lane.swimmerId;

  return (
    <div className="grid grid-cols-[40px_1fr_auto] md:grid-cols-[48px_1fr_90px_120px_140px_120px] gap-2 px-3 py-2 items-center text-sm hover:bg-muted/30">
      {/* Lane number */}
      <div className="flex items-center justify-center w-10 h-10 rounded-md bg-navy text-white font-bold text-base">
        {lane.laneNo}
      </div>

      {/* Swimmer */}
      <div className="min-w-0">
        {isEmpty ? (
          <span className="text-muted-foreground italic text-xs">— Empty —</span>
        ) : (
          <div className="truncate font-medium">{lane.swimmerName}</div>
        )}
        {lane.laps.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {lane.laps.length} lap{lane.laps.length > 1 ? "s" : ""}
            {lane.laps.length > 0 && (
              <> • Last: {formatMs(lane.laps[lane.laps.length - 1].lapMs)}</>
            )}
          </div>
        )}
      </div>

      {/* Status badge */}
      <div>
        <span
          className={cn(
            "inline-block px-2 py-0.5 rounded text-[10px] font-semibold",
            STATUS_COLORS[lane.status]
          )}
        >
          {STATUS_LABEL[lane.status]}
        </span>
      </div>

      {/* Live time */}
      <div className="lp-timer-digits text-lg font-bold tabular-nums text-navy">
        {lane.status === "RUNNING" || lane.status === "FINISHED"
          ? formatMs(elapsed)
          : "00:00.00"}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 justify-center">
        {lane.status === "RUNNING" ? (
          <Button
            size="sm"
            onClick={() => onStop(lane.laneNo)}
            className="bg-red-600 hover:bg-red-700 text-white h-9 px-3"
          >
            <Square className="size-3.5" /> STOP
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onStart(lane.laneNo)}
            disabled={isEmpty || lane.status === "FINISHED"}
            className="bg-green-600 hover:bg-green-700 text-white h-9 px-3"
          >
            <Play className="size-3.5" /> START
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onLap(lane.laneNo)}
          disabled={lane.status !== "RUNNING"}
          className="h-9 px-2"
          title="Record lap"
        >
          <Zap className="size-3.5" /> LAP
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReset(lane.laneNo)}
          disabled={lane.status === "IDLE" || isEmpty}
          className="h-9 px-2"
          title="Reset lane"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      {/* Last lap (desktop) */}
      <div className="hidden md:block lp-timer-digits text-sm text-muted-foreground tabular-nums">
        {lane.lastLapMs !== null ? formatMs(lane.lastLapMs) : "—"}
      </div>
    </div>
  );
}

// ============================================================
// FINISH CAPTURE VIEW — 12 large buttons (3x4 / 4x3)
// ============================================================

function FinishCaptureView({
  lanes,
  tick,
  onFinish,
}: {
  lanes: LiveLaneState[];
  tick: number;
  onFinish: (n: number) => void;
}) {
  void tick;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flag className="size-4 text-red-600" /> Finish Capture Mode
          <Badge variant="secondary" className="ml-auto text-xs">
            Tap to stop running lanes instantly
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {lanes.map((lane) => {
            const isRunning = lane.status === "RUNNING";
            const elapsed = liveElapsedMs(lane);
            return (
              <button
                key={lane.laneNo}
                onClick={() => isRunning && onFinish(lane.laneNo)}
                disabled={!isRunning}
                className={cn(
                  "relative rounded-xl border-2 p-3 sm:p-4 text-left transition-all min-h-[110px] sm:min-h-[130px] flex flex-col justify-between",
                  isRunning
                    ? "bg-aqua text-white border-aqua shadow-lg lp-running-pulse hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    : lane.status === "FINISHED"
                    ? "bg-green-50 border-green-300 text-green-800"
                    : "bg-muted/50 border-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                    Finish L{lane.laneNo}
                  </span>
                  {lane.status === "FINISHED" && (
                    <CheckCircle2 className="size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {lane.swimmerName || "— Empty —"}
                  </div>
                  <div className="lp-timer-digits text-2xl sm:text-3xl font-extrabold tabular-nums mt-1">
                    {lane.status === "RUNNING" || lane.status === "FINISHED"
                      ? formatMs(elapsed)
                      : "00:00.00"}
                  </div>
                </div>
                {isRunning && (
                  <div className="text-[10px] uppercase tracking-wider opacity-80">
                    Tap to finish →
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// LAP CAPTURE VIEW — 12 large buttons
// ============================================================

function LapCaptureView({
  lanes,
  tick,
  onLap,
}: {
  lanes: LiveLaneState[];
  tick: number;
  onLap: (n: number) => void;
}) {
  void tick;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="size-4 text-aqua" /> Lap Capture Mode
          <Badge variant="secondary" className="ml-auto text-xs">
            Records lap instantly for running lanes
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {lanes.map((lane) => {
            const isRunning = lane.status === "RUNNING";
            const elapsed = liveElapsedMs(lane);
            return (
              <button
                key={lane.laneNo}
                onClick={() => isRunning && onLap(lane.laneNo)}
                disabled={!isRunning}
                className={cn(
                  "relative rounded-xl border-2 p-3 sm:p-4 text-left transition-all min-h-[110px] sm:min-h-[130px] flex flex-col justify-between",
                  isRunning
                    ? "bg-navy text-white border-navy shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    : "bg-muted/50 border-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                    Lap L{lane.laneNo}
                  </span>
                  {lane.laps.length > 0 && (
                    <Badge className="bg-aqua text-white text-[10px]">
                      #{lane.laps.length}
                    </Badge>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {lane.swimmerName || "— Empty —"}
                  </div>
                  <div className="lp-timer-digits text-2xl sm:text-3xl font-extrabold tabular-nums mt-1">
                    {lane.status === "RUNNING" || lane.status === "FINISHED"
                      ? formatMs(elapsed)
                      : "00:00.00"}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-wider opacity-80">
                  {isRunning
                    ? "Tap to record lap"
                    : lane.lastLapMs !== null
                    ? `Last: ${formatMs(lane.lastLapMs!)}`
                    : "Idle"}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
