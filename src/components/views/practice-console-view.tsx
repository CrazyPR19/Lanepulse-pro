"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { formatMs } from "@/lib/helpers";
import type { GroupMemberDTO, TrainingGroupDTO, TrainingPlanDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Activity, ChevronDown, ChevronUp, Flag, Play, Save, Trash2, Zap, CheckCircle2, FastForward } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Lap = { lapNo: number; lapMs: number; cumulativeMs: number };
type ResultStatus = "READY" | "RUNNING" | "COMPLETED" | "DNS" | "DQ";
type RepeatStatus = "READY" | "RUNNING" | "AWAITING_SAVE" | "SAVED";
type Result = { key: string; swimmerId: string; swimmerName: string; laneNo: number; status: ResultStatus; startAt: number | null; finishAt: number | null; laps: Lap[] };
type RunGroup = {
  id: string;
  key: string;
  groupId: string;
  groupName: string;
  offsetSeconds: number;
  status: "READY" | "RUNNING" | "COMPLETED";
  currentRepeatNo: number;
  totalRepeats: number;
  repeatStatus: RepeatStatus;
  startAt: number | null;
  endAt: number | null;
  completedRepeatCount: number;
  nextRepeatReady: boolean;
  results: Result[];
};
type SavedRun = {
  id: string;
  groups: {
    id: string;
    groupId: string | null;
    groupNameSnapshot: string;
    currentRepeatNo: number;
    totalRepeats: number;
    repeatStatus: string;
    completedRepeatCount: number;
    nextRepeatReady: boolean;
  }[];
};
type SavedGroup = {
  id: string;
  status: string;
  currentRepeatNo: number;
  totalRepeats: number;
  repeatStatus: string;
  repeatStartTime: string | null;
  repeatEndTime: string | null;
  completedRepeatCount: number;
  nextRepeatReady: boolean;
};
type CaptureMode = "board" | "finish" | "lap";

const STORAGE_KEY = "lanepulse-practice-run-v2";

export function PracticeConsoleView() {
  const [plans, setPlans] = useState<TrainingPlanDTO[]>([]);
  const [groups, setGroups] = useState<TrainingGroupDTO[]>([]);
  const [planId, setPlanId] = useState("");
  const [setId, setSetId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [gapSeconds, setGapSeconds] = useState(5);
  const [runId, setRunId] = useState<string | null>(null);
  const [runGroups, setRunGroups] = useState<RunGroup[]>([]);
  const [mode, setMode] = useState<CaptureMode>("board");
  const [saving, setSaving] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [armNext, setArmNext] = useState(true);
  const [tick, setTick] = useState(0);
  const timers = useRef<number[]>([]);

  const plan = plans.find((row) => row.id === planId);
  const planSet = plan?.sets.find((row) => row.id === setId);
  const anyStarted = runGroups.some((group) => group.completedRepeatCount > 0 || group.startAt !== null);
  const anyRunning = runGroups.some((group) => group.repeatStatus === "RUNNING");
  const allGroupsComplete = runGroups.length > 0 && runGroups.every((group) => group.completedRepeatCount >= group.totalRepeats);

  useEffect(() => {
    Promise.all([api.get<TrainingPlanDTO[]>("/api/training-plans"), api.get<TrainingGroupDTO[]>("/api/groups?active=true")])
      .then(([planRows, groupRows]) => { setPlans(planRows.filter((row) => row.status === "ACTIVE")); setGroups(groupRows); })
      .catch((error) => toast.error(error.message));
    const hydrateTimer = window.setTimeout(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) try {
        const saved = JSON.parse(raw);
        setPlanId(saved.planId ?? ""); setSetId(saved.setId ?? ""); setGapSeconds(saved.gapSeconds ?? 5);
        setRunId(saved.runId ?? null); setRunGroups(saved.runGroups ?? []); setSetupCollapsed((saved.runGroups ?? []).some((g: RunGroup) => g.startAt));
      } catch { localStorage.removeItem(STORAGE_KEY); }
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    if (runGroups.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ planId, setId, gapSeconds, runId, runGroups }));
  }, [planId, setId, gapSeconds, runId, runGroups]);

  useEffect(() => { const id = window.setInterval(() => setTick((value) => value + 1), 50); return () => { clearInterval(id); timers.current.forEach(clearTimeout); }; }, []);
  void tick;

  const prepare = async () => {
    if (!planSet) return toast.error("Select an active plan and set");
    if (!selectedGroupIds.length) return toast.error("Select at least one group");
    if (runGroups.length && !window.confirm("Replace the prepared practice run? Unsaved captures will be lost.")) return;
    try {
      const details = await Promise.all(selectedGroupIds.map((id) => api.get<TrainingGroupDTO & { members: GroupMemberDTO[] }>(`/api/groups/${id}`)));
      if (details.some((group) => group.members.length === 0)) return toast.error("Every selected group must have at least one active swimmer");
      const preparedGroups: RunGroup[] = details.map((group, index) => ({
        id: "", key: crypto.randomUUID(), groupId: group.id, groupName: group.groupName,
        offsetSeconds: index * Math.max(0, gapSeconds), status: "READY", startAt: null,
        currentRepeatNo: 1, totalRepeats: planSet.repeatCount, repeatStatus: "READY", endAt: null,
        completedRepeatCount: 0, nextRepeatReady: true,
        results: group.members.map((member) => ({ key: crypto.randomUUID(), swimmerId: member.swimmerId, swimmerName: member.swimmerName ?? "Swimmer", laneNo: member.laneNo, status: "READY", startAt: null, finishAt: null, laps: [] })),
      }));
      const saved = await api.post<SavedRun>("/api/practice-runs", {
        trainingPlanId: planId,
        trainingPlanSetId: setId,
        sessionDate: new Date().toISOString(),
        styleId: planSet.swimmingStyleId,
        distanceMeters: planSet.distanceMeters,
        status: "DRAFT",
        groups: preparedGroups.map((group) => ({
          groupId: group.groupId,
          groupNameSnapshot: group.groupName,
          plannedStartOffsetSeconds: group.offsetSeconds,
          actualStartTime: null,
          status: "READY",
          currentRepeatNo: 1,
          totalRepeats: group.totalRepeats,
          repeatStatus: "READY",
          completedRepeatCount: 0,
          nextRepeatReady: true,
          results: group.results.map((result) => ({
            swimmerId: result.swimmerId,
            swimmerNameSnapshot: result.swimmerName,
            laneNo: result.laneNo,
            startTime: null,
            finishTime: null,
            elapsedSeconds: null,
            resultText: null,
            status: "READY",
            laps: [],
          })),
        })),
      });
      setRunGroups(preparedGroups.map((group) => ({
        ...group,
        id: saved.groups.find((row) => row.groupId === group.groupId)?.id ?? "",
      })));
      setRunId(saved.id); setSetupCollapsed(false); toast.success("Practice run prepared and saved. Start each group when ready.");
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Failed to prepare practice run"); }
  };

  const startGroup = async (key: string) => {
    const group = runGroups.find((row) => row.key === key);
    if (!runId || !group?.id) return toast.error("Save or prepare the practice run before starting a group");
    if (group.repeatStatus !== "READY") return;
    try {
      const started = await api.post<SavedGroup>(`/api/practice-runs/${runId}/groups/${group.id}/repeats/${group.currentRepeatNo}/start`);
      const startAt = started.repeatStartTime ? new Date(started.repeatStartTime).getTime() : Date.now();
      setRunGroups((rows) => rows.map((row) => row.key !== key ? row : {
        ...row,
        status: "RUNNING",
        repeatStatus: "RUNNING",
        startAt,
        endAt: null,
        nextRepeatReady: false,
        results: row.results.map((result) => ({ ...result, status: "RUNNING", startAt, finishAt: null, laps: [] })),
      }));
      setSetupCollapsed(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start group repeat");
    }
  };

  const startNext = () => {
    const next = runGroups.find((group) => group.repeatStatus === "READY");
    if (!next) return toast.message("No prepared group is waiting");
    void startGroup(next.key);
  };

  const startAllWithGap = () => {
    const ready = runGroups.filter((group) => group.repeatStatus === "READY");
    if (!ready.length) return toast.error("No groups are ready");
    if (!window.confirm(`Start ${ready.length} groups with a ${gapSeconds}-second gap?`)) return;
    ready.forEach((group, index) => {
      const timer = window.setTimeout(() => void startGroup(group.key), index * Math.max(0, gapSeconds) * 1000);
      timers.current.push(timer);
    });
    toast.success("Staggered starts armed by your command");
  };

  const finish = (groupKey: string, resultKey: string) => {
    const now = Date.now();
    setRunGroups((rows) => rows.map((group) => group.key !== groupKey ? group : completeGroupIfDone({
      ...group, results: group.results.map((result) => result.key !== resultKey || result.status !== "RUNNING" ? result : { ...result, status: "COMPLETED", finishAt: now }),
    })));
  };

  const markResult = (groupKey: string, resultKey: string, status: "DNS" | "DQ") => {
    const now = Date.now();
    setRunGroups((rows) => rows.map((group) => group.key !== groupKey ? group : completeGroupIfDone({
      ...group,
      results: group.results.map((result) => result.key !== resultKey || !["READY", "RUNNING"].includes(result.status)
        ? result
        : { ...result, status, finishAt: now }),
    })));
  };

  const lap = (groupKey: string, resultKey: string) => {
    const now = Date.now();
    setRunGroups((rows) => rows.map((group) => group.key !== groupKey ? group : {
      ...group, results: group.results.map((result) => {
        if (result.key !== resultKey || result.status !== "RUNNING" || !result.startAt) return result;
        const cumulativeMs = now - result.startAt;
        const previous = result.laps.at(-1)?.cumulativeMs ?? 0;
        return { ...result, laps: [...result.laps, { lapNo: result.laps.length + 1, lapMs: cumulativeMs - previous, cumulativeMs }] };
      }),
    }));
  };

  const finalizeGroup = async (groupKey: string, prepareNext: boolean) => {
    const group = runGroups.find((row) => row.key === groupKey);
    if (!runId || !group?.id) return toast.error("Practice group is not saved yet");
    if (group.repeatStatus !== "AWAITING_SAVE") return toast.error("Finish or mark every swimmer DNS/DQ before saving this repeat");
    setSaving(true);
    try {
      const saved = await api.post<SavedGroup>(`/api/practice-runs/${runId}/groups/${group.id}/repeats/${group.currentRepeatNo}/finalize`, {
        prepareNext,
        results: group.results.map((result) => {
          const elapsedMs = result.status === "COMPLETED" && result.startAt && result.finishAt ? result.finishAt - result.startAt : null;
          return {
            swimmerId: result.swimmerId,
            swimmerNameSnapshot: result.swimmerName,
            laneNo: result.laneNo,
            startTime: iso(result.startAt),
            finishTime: iso(result.finishAt),
            elapsedSeconds: elapsedMs == null ? null : elapsedMs / 1000,
            resultText: elapsedMs == null ? result.status : formatMs(elapsedMs),
            status: result.status,
            laps: result.laps.map((item) => ({ lapNo: item.lapNo, lapTimeSeconds: item.lapMs / 1000, cumulativeSeconds: item.cumulativeMs / 1000, lapTimeText: formatMs(item.lapMs) })),
          };
        }),
      });
      setRunGroups((rows) => rows.map((row) => row.key !== groupKey ? row : applySavedGroup(row, saved, prepareNext)));
      toast.success(`${group.groupName} Repeat ${group.currentRepeatNo} saved independently`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save group repeat");
    } finally {
      setSaving(false);
    }
  };

  const startNextRepeat = async (groupKey: string) => {
    const group = runGroups.find((row) => row.key === groupKey);
    if (!runId || !group?.id || group.repeatStatus !== "SAVED") return;
    setSaving(true);
    try {
      const prepared = await api.post<SavedGroup>(`/api/practice-runs/${runId}/groups/${group.id}/repeats/${group.currentRepeatNo}/prepare-next`);
      await api.post(`/api/practice-runs/${runId}/groups/${group.id}/repeats/${prepared.currentRepeatNo}/start`);
      const startAt = Date.now();
      setRunGroups((rows) => rows.map((row) => row.key !== groupKey ? row : {
        ...applySavedGroup(row, prepared, true),
        status: "RUNNING",
        repeatStatus: "RUNNING",
        startAt,
        nextRepeatReady: false,
        results: resetResults(row.results, startAt),
      }));
      toast.success(`${group.groupName} Repeat ${prepared.currentRepeatNo} started`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start next repeat");
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!runId) return toast.error("Prepare a practice run first");
    setSaving(true);
    try {
      await api.patch("/api/practice-runs", { id: runId, status: anyRunning ? "RUNNING" : "DRAFT" });
      toast.success("Practice run state saved");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save practice run");
    } finally {
      setSaving(false);
    }
  };

  const completeRun = async () => {
    if (!runId || !allGroupsComplete) return toast.error(incompleteMessage(runGroups));
    setSaving(true);
    try {
      await api.patch("/api/practice-runs", { id: runId, status: "COMPLETED" });
      localStorage.removeItem(STORAGE_KEY); setRunGroups([]); setRunId(null); setSetupCollapsed(false);
      toast.success("Practice run completed and saved");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to complete practice run");
    } finally {
      setSaving(false);
    }
  };

  const endRemainingRepeats = async () => {
    if (!runId) return;
    if (!window.confirm(`${incompleteMessage(runGroups)} End all remaining unsaved repeats and complete this practice run? Saved results and laps will be kept.`)) return;
    setSaving(true);
    try {
      await api.patch("/api/practice-runs", { id: runId, status: "COMPLETED", forceComplete: true });
      localStorage.removeItem(STORAGE_KEY); setRunGroups([]); setRunId(null); setSetupCollapsed(false);
      toast.success("Remaining repeats ended and practice run completed");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to end remaining repeats");
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard this practice run and all unsaved captures?")) return;
    if (runId) {
      try { await api.patch("/api/practice-runs", { id: runId, status: "CANCELLED" }); }
      catch (error: any) { return toast.error(error.message); }
    }
    timers.current.forEach(clearTimeout); timers.current = []; localStorage.removeItem(STORAGE_KEY);
    setRunGroups([]); setRunId(null); setSetupCollapsed(false); toast.success("Practice run discarded locally");
  };

  const lastStart = Math.max(0, ...runGroups.map((group) => group.startAt ?? 0));
  const armRemaining = lastStart ? Math.max(0, gapSeconds - (Date.now() - lastStart) / 1000) : 0;

  return <div className="space-y-3 sm:space-y-4 max-w-7xl mx-auto">
    <div className="flex flex-wrap items-center gap-2"><Activity className="size-6 text-aqua" /><div className="min-w-0"><h1 className="text-xl sm:text-2xl font-bold">Multi-Group Practice Console</h1><p className="text-sm text-muted-foreground">Independent starts and fast capture for overlapping groups.</p></div></div>

    {anyStarted && <div className="sticky top-14 z-30 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-y flex items-center gap-2 overflow-x-auto">
      <Badge className="shrink-0">{planSet?.setLabel}</Badge><Button size="sm" onClick={startNext} disabled={armNext && armRemaining > 0}><FastForward /> {armNext && armRemaining > 0 ? `Next ${armRemaining.toFixed(1)}s` : "Start Ready Group"}</Button><Button size="sm" variant="outline" onClick={saveDraft} disabled={saving}><Save /> Draft</Button><Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={completeRun} disabled={saving || !allGroupsComplete}><CheckCircle2 /> Complete</Button>
    </div>}

    <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center">Practice Setup{runGroups.length > 0 && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSetupCollapsed((value) => !value)}>{setupCollapsed ? <ChevronDown /> : <ChevronUp />}{setupCollapsed ? "Show" : "Hide"}</Button>}</CardTitle></CardHeader>{!setupCollapsed && <CardContent className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Field label="Training Plan"><select className="control" value={planId} onChange={(e) => { setPlanId(e.target.value); setSetId(""); }}><option value="">Select active plan</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.planName}</option>)}</select></Field>
        <Field label="Current Set"><select className="control" value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">Select set</option>{plan?.sets.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.sequenceNo}. {item.setLabel}</option>)}</select></Field>
        <Field label="Start Gap (seconds)"><Input type="number" min={0} value={gapSeconds} onChange={(e) => setGapSeconds(Math.max(0, Number(e.target.value)))} className="h-11" /></Field>
      </div>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm"><span className="text-muted-foreground">Planned Repeats:</span> <strong>{planSet?.repeatCount ?? "Select a set"}</strong>{planSet && <span className="text-muted-foreground"> · tracked independently for every group</span>}</div>
      <div><Label className="text-xs text-muted-foreground">Groups for this set</Label><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-1">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 border rounded-md p-3 min-w-0 cursor-pointer"><input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={(e) => setSelectedGroupIds((ids) => e.target.checked ? [...ids, group.id] : ids.filter((id) => id !== group.id))} /><span className="truncate text-sm">{group.groupName} ({group.memberCount ?? 0})</span></label>)}</div></div>
      <Button className="w-full h-12 bg-navy hover:bg-navy/90" onClick={prepare}>Prepare Practice Run</Button>
    </CardContent>}</Card>

    {runGroups.length > 0 && <>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Independent Group Repeats</CardTitle></CardHeader><CardContent className="space-y-3">{runGroups.map((group, index) => {
        const completedSwimmers = group.results.filter((result) => isTerminal(result.status)).length;
        const remainingRepeats = Math.max(0, group.totalRepeats - group.completedRepeatCount);
        return <div key={group.key} className="border rounded-md p-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold truncate">G{index + 1} · {group.groupName}</p><p className="text-sm font-medium">Repeat {group.currentRepeatNo} of {group.totalRepeats}</p></div><Badge variant={group.repeatStatus === "RUNNING" ? "default" : "secondary"}>{group.status === "COMPLETED" ? "SET COMPLETED" : group.repeatStatus.replaceAll("_", " ")}</Badge></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"><span>Swimmers <strong>{completedSwimmers}/{group.results.length}</strong></span><span>Completed <strong>{group.completedRepeatCount}/{group.totalRepeats}</strong></span><span>Remaining <strong>{remainingRepeats}</strong></span><span>Elapsed <strong className="font-mono">{formatMs(groupElapsed(group))}</strong></span></div>
          <p className="text-xs text-muted-foreground">Start {group.startAt ? new Date(group.startAt).toLocaleTimeString() : "not started"} · lanes {group.results.map((result) => result.laneNo).join(", ")} · planned offset +{group.offsetSeconds}s</p>
          <div className="flex flex-wrap gap-2">
            {group.repeatStatus === "READY" && <Button className="h-11 bg-green-600 hover:bg-green-700" disabled={saving} onClick={() => void startGroup(group.key)}><Play /> Start {group.groupName} · Repeat {group.currentRepeatNo}</Button>}
            {group.repeatStatus === "AWAITING_SAVE" && <><Button variant="outline" className="h-11" disabled={saving} onClick={() => void finalizeGroup(group.key, false)}><Save /> Save {group.groupName} · Repeat {group.currentRepeatNo}</Button><Button className="h-11 bg-green-600 hover:bg-green-700" disabled={saving} onClick={() => void finalizeGroup(group.key, true)}><FastForward /> Save Repeat &amp; Arm Next</Button></>}
            {group.repeatStatus === "SAVED" && group.completedRepeatCount < group.totalRepeats && <Button className="h-11 bg-green-600 hover:bg-green-700" disabled={saving} onClick={() => void startNextRepeat(group.key)}><Play /> Start {group.groupName} · Repeat {group.currentRepeatNo + 1}</Button>}
            {group.status === "COMPLETED" && <span className="text-sm font-medium text-green-700 flex items-center gap-1"><CheckCircle2 className="size-4" /> All repeats saved</span>}
          </div>
        </div>;
      })}</CardContent></Card>
      <div className="grid sm:grid-cols-2 lg:flex gap-2"><Button className="h-12 bg-green-600 hover:bg-green-700" onClick={startNext}><FastForward /> Start Next Group</Button><Button className="h-12" variant="outline" onClick={startAllWithGap}>Start All Groups With Gap</Button><label className="flex items-center gap-2 text-sm border rounded-md px-3 h-12"><input type="checkbox" checked={armNext} onChange={(e) => setArmNext(e.target.checked)} /> Arm next after {gapSeconds}s</label></div>
      <div className="flex gap-2 overflow-x-auto"><Mode active={mode === "board"} onClick={() => setMode("board")} icon={Activity}>Board</Mode><Mode active={mode === "finish"} onClick={() => setMode("finish")} icon={Flag}>Finish Capture</Mode><Mode active={mode === "lap"} onClick={() => setMode("lap")} icon={Zap}>Lap Capture</Mode></div>
      {mode === "board" && <ActiveBoard groups={runGroups} finish={finish} lap={lap} markResult={markResult} />}
      {mode === "finish" && <CaptureGrid groups={runGroups} action="finish" onTap={finish} />}
      {mode === "lap" && <CaptureGrid groups={runGroups} action="lap" onTap={lap} />}
      <div className="rounded-md border p-3 text-sm space-y-1"><p className="font-medium">Practice completion</p>{runGroups.map((group) => <p key={group.key} className="text-muted-foreground">{group.groupName}: {group.completedRepeatCount}/{group.totalRepeats} repeats completed</p>)}{!allGroupsComplete && <p className="text-amber-700">{incompleteMessage(runGroups)}</p>}</div>
      <div className="grid grid-cols-2 sm:flex gap-2"><Button variant="outline" className="h-12" onClick={saveDraft} disabled={saving}><Save /> Save Draft</Button><Button className="h-12 bg-green-600 hover:bg-green-700" onClick={completeRun} disabled={saving || !allGroupsComplete}><CheckCircle2 /> Complete Practice Run</Button>{!allGroupsComplete && <Button variant="outline" className="h-12" onClick={endRemainingRepeats} disabled={saving}><Flag /> End Remaining Repeats</Button>}<Button variant="destructive" className="h-12 col-span-2" onClick={discard}><Trash2 /> Discard Run</Button></div>
    </>}
  </div>;
}

function ActiveBoard({ groups, finish, lap, markResult }: { groups: RunGroup[]; finish: (g: string, r: string) => void; lap: (g: string, r: string) => void; markResult: (g: string, r: string, status: "DNS" | "DQ") => void }) {
  const active = groups.filter((group) => group.repeatStatus === "RUNNING" || group.repeatStatus === "AWAITING_SAVE");
  if (!active.length) return <p className="text-sm text-muted-foreground border rounded-md p-6 text-center">Start a prepared group to open the active timing board.</p>;
  return <div className="space-y-3">{active.map((group) => <Card key={group.key}><CardHeader className="pb-2"><CardTitle className="text-sm flex flex-wrap gap-2">G{groups.indexOf(group) + 1} · {group.groupName}<Badge>Repeat {group.currentRepeatNo} of {group.totalRepeats}</Badge>{group.startAt && <Badge variant="secondary">Started {new Date(group.startAt).toLocaleTimeString()}</Badge>}</CardTitle></CardHeader><CardContent className="p-0 divide-y">{group.results.map((result) => <div key={result.key} className="grid grid-cols-[44px_1fr] sm:grid-cols-[44px_1fr_auto] gap-2 items-center p-2 sm:p-3"><span className="size-10 rounded-md bg-navy text-white grid place-items-center font-bold">{result.laneNo}</span><div className="min-w-0"><p className="font-medium truncate">{result.swimmerName}</p><p className="font-mono font-bold text-lg">{formatMs(elapsed(result))}</p><span className="text-[10px] text-muted-foreground">{result.laps.length} laps · {result.status}</span></div><div className="col-span-2 sm:col-span-1 flex flex-wrap gap-1"><Button size="sm" variant="outline" className="h-10" disabled={result.status !== "RUNNING"} onClick={() => lap(group.key, result.key)}><Zap /> LAP</Button><Button size="sm" className="h-10 bg-red-600 hover:bg-red-700" disabled={result.status !== "RUNNING"} onClick={() => finish(group.key, result.key)}><Flag /> FINISH</Button><Button size="sm" variant="outline" className="h-10" disabled={!['READY', 'RUNNING'].includes(result.status)} onClick={() => markResult(group.key, result.key, "DNS")}>DNS</Button><Button size="sm" variant="outline" className="h-10" disabled={!['READY', 'RUNNING'].includes(result.status)} onClick={() => markResult(group.key, result.key, "DQ")}>DQ</Button></div></div>)}</CardContent></Card>)}</div>;
}

function CaptureGrid({ groups, action, onTap }: { groups: RunGroup[]; action: "finish" | "lap"; onTap: (g: string, r: string) => void }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{groups.flatMap((group, groupIndex) => group.results.map((result) => {
    const enabled = result.status === "RUNNING";
    return <button key={result.key} disabled={!enabled} onClick={() => enabled && onTap(group.key, result.key)} className={cn("min-h-28 rounded-md border-2 p-3 text-left flex flex-col justify-between active:scale-[0.98]", enabled ? action === "finish" ? "bg-red-600 border-red-600 text-white" : "bg-navy border-navy text-white" : "bg-muted/50 text-muted-foreground")}><span className="text-xs font-bold">G{groupIndex + 1} L{result.laneNo} {action === "lap" ? "LAP" : "FINISH"}</span><span className="font-semibold break-words leading-tight">{result.swimmerName}</span><span className="font-mono text-xl font-bold">{formatMs(elapsed(result))}</span></button>;
  }))}</div>;
}

function Mode({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) { return <Button variant={active ? "default" : "outline"} onClick={onClick} className={active ? "bg-aqua hover:bg-aqua/90" : ""}><Icon />{children}</Button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>; }
function iso(value: number | null) { return value ? new Date(value).toISOString() : null; }
function elapsed(result: Result) { if (!result.startAt) return 0; return (result.finishAt ?? Date.now()) - result.startAt; }
function groupElapsed(group: RunGroup) { if (!group.startAt) return 0; return (group.endAt ?? Date.now()) - group.startAt; }
function isTerminal(status: ResultStatus) { return status === "COMPLETED" || status === "DNS" || status === "DQ"; }
function completeGroupIfDone(group: RunGroup): RunGroup { return group.results.every((result) => isTerminal(result.status)) ? { ...group, repeatStatus: "AWAITING_SAVE", endAt: Date.now() } : group; }
function resetResults(results: Result[], startAt: number | null = null): Result[] {
  return results.map((result) => ({ ...result, key: crypto.randomUUID(), status: startAt ? "RUNNING" : "READY", startAt, finishAt: null, laps: [] }));
}
function applySavedGroup(group: RunGroup, saved: SavedGroup, resetForNext: boolean): RunGroup {
  const repeatStatus = saved.repeatStatus as RepeatStatus;
  return {
    ...group,
    status: saved.status as RunGroup["status"],
    currentRepeatNo: saved.currentRepeatNo,
    totalRepeats: saved.totalRepeats,
    repeatStatus,
    startAt: saved.repeatStartTime ? new Date(saved.repeatStartTime).getTime() : resetForNext ? null : group.startAt,
    endAt: saved.repeatEndTime ? new Date(saved.repeatEndTime).getTime() : null,
    completedRepeatCount: saved.completedRepeatCount,
    nextRepeatReady: saved.nextRepeatReady,
    results: resetForNext && repeatStatus === "READY" ? resetResults(group.results) : group.results,
  };
}
function incompleteMessage(groups: RunGroup[]) {
  const incomplete = groups.filter((group) => group.completedRepeatCount < group.totalRepeats);
  if (!incomplete.length) return "All groups completed all planned repeats.";
  return incomplete.map((group) => {
    const remaining = group.totalRepeats - group.completedRepeatCount;
    return `${group.groupName} still has ${remaining} repeat${remaining === 1 ? "" : "s"} remaining.`;
  }).join(" ");
}
