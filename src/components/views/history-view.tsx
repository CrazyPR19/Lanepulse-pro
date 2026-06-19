"use client";

// LanePulse Pro — Session History
// Task ID: 6 — History View
//
// Features:
//  - Filter bar (date range, swimmer, group, style, distance, status) — all optional, debounced.
//  - Responsive table (desktop) / cards (mobile).
//  - Status badge colored: DRAFT gray, RUNNING aqua, COMPLETED green, ABORTED red.
//  - Actions: View Details (dialog with lanes + laps), Export CSV (per row + bulk).
//  - Delete: SUPER_ADMIN only, typed "DELETE SESSION" confirmation.
//  - VIEWER + COACH: view + export. Only SUPER_ADMIN can delete.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { canDeleteEverything, formatSeconds } from "@/lib/helpers";
import type {
  TrainingSessionDTO,
  SessionLaneDTO,
  SessionStatus,
  SwimmerDTO,
  TrainingGroupDTO,
  SwimmingStyleDTO,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  Eye,
  Download,
  Trash2,
  Filter,
  X,
  Loader2,
  Calendar,
  Clock,
} from "lucide-react";

type SessionDetailDTO = TrainingSessionDTO & { lanes: SessionLaneDTO[] };

const DISTANCES = [25, 50, 100, 200, 400, 800, 1500];
const STATUSES: SessionStatus[] = ["DRAFT", "RUNNING", "COMPLETED", "ABORTED"];

const STATUS_BADGE: Record<SessionStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  RUNNING: "bg-aqua text-white border-aqua",
  COMPLETED: "bg-green-600 text-white border-green-600",
  ABORTED: "bg-red-500 text-white border-red-500",
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  DRAFT: "Draft",
  RUNNING: "Running",
  COMPLETED: "Completed",
  ABORTED: "Aborted",
};

const LANE_STATUS_DOT: Record<string, string> = {
  IDLE: "bg-muted-foreground",
  READY: "bg-blue-400",
  RUNNING: "bg-aqua",
  FINISHED: "bg-green-500",
  DNF: "bg-red-500",
};

// ============================================================
// MAIN VIEW
// ============================================================
export function HistoryView() {
  const user = useAppStore((s) => s.user);
  const canDelete = canDeleteEverything(user?.role);
  const qc = useQueryClient();

  // ---- filter state ----
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    swimmerId: "",
    groupId: "",
    styleId: "",
    distance: "",
    status: "",
  });

  // Debounced filter snapshot used for the actual query
  const [debounced, setDebounced] = useState(filters);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(filters), 350);
    return () => clearTimeout(id);
  }, [filters]);

  const setFilter = (key: keyof typeof filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () =>
    setFilters({
      from: "",
      to: "",
      swimmerId: "",
      groupId: "",
      styleId: "",
      distance: "",
      status: "",
    });

  const hasFilters = Object.values(filters).some((v) => v !== "");

  // ---- queries for filter dropdowns ----
  const swimmersQ = useQuery({
    queryKey: ["swimmers"],
    queryFn: () => api.get<SwimmerDTO[]>("/api/swimmers"),
  });
  const groupsQ = useQuery({
    queryKey: ["groups", "active"],
    queryFn: () => api.get<TrainingGroupDTO[]>("/api/groups?active=true"),
  });
  const stylesQ = useQuery({
    queryKey: ["styles"],
    queryFn: () => api.get<SwimmingStyleDTO[]>("/api/styles"),
  });

  // ---- sessions query ----
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced.from) p.set("from", debounced.from);
    if (debounced.to) p.set("to", debounced.to);
    if (debounced.swimmerId) p.set("swimmerId", debounced.swimmerId);
    if (debounced.groupId) p.set("groupId", debounced.groupId);
    if (debounced.styleId) p.set("styleId", debounced.styleId);
    if (debounced.distance) p.set("distance", debounced.distance);
    if (debounced.status) p.set("status", debounced.status);
    return p.toString();
  }, [debounced]);

  const sessionsQ = useQuery({
    queryKey: ["sessions", queryString],
    queryFn: () =>
      api.get<TrainingSessionDTO[]>(`/api/sessions?${queryString}`),
  });

  // ---- detail dialog ----
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailQ = useQuery({
    queryKey: ["session", detailId],
    queryFn: () => api.get<SessionDetailDTO>(`/api/sessions/${detailId}`),
    enabled: !!detailId,
  });

  // ---- delete dialog ----
  const [deleteTarget, setDeleteTarget] = useState<TrainingSessionDTO | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/sessions/${id}`, { confirm: "DELETE SESSION" }),
    onSuccess: () => {
      toast.success("Session deleted");
      setDeleteTarget(null);
      setDeleteConfirm("");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to delete session";
      toast.error(msg);
    },
  });

  // ---- CSV export ----
  const exportingRef = useExportTracker();

  const handleExportOne = async (session: TrainingSessionDTO) => {
    exportingRef.start(session.id);
    try {
      const detail = await api.get<SessionDetailDTO>(
        `/api/sessions/${session.id}`
      );
      const csv = sessionToCsv(detail);
      downloadCsv(csv, csvFilename(detail));
      toast.success(`Exported "${detail.sessionName}"`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to export session";
      toast.error(msg);
    } finally {
      exportingRef.stop(session.id);
    }
  };

  const handleExportAll = async () => {
    const list = sessionsQ.data ?? [];
    if (list.length === 0) {
      toast.error("No sessions to export");
      return;
    }
    exportingRef.start("__all__");
    try {
      const rows: string[] = [CSV_HEADER];
      for (const s of list) {
        const detail = await api.get<SessionDetailDTO>(
          `/api/sessions/${s.id}`
        );
        rows.push(...sessionToCsvRows(detail));
      }
      const csv = rows.join("\n");
      downloadCsv(
        csv,
        `lanepulse-sessions-${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.success(`Exported ${list.length} session(s)`);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to export sessions";
      toast.error(msg);
    } finally {
      exportingRef.stop("__all__");
    }
  };

  const sessions = sessionsQ.data ?? [];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="size-6 text-aqua" />
            Session History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse, filter, and export past training sessions.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportAll}
          disabled={
            sessions.length === 0 || exportingRef.isExporting("__all__")
          }
          className="gap-2"
        >
          {exportingRef.isExporting("__all__") ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export All ({sessions.length})
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="bg-card">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="size-4 text-aqua" />
            Filters
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 px-2 text-xs gap-1 ml-auto"
              >
                <X className="size-3" />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilter("from", e.target.value)}
                className="mt-0.5 h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilter("to", e.target.value)}
                className="mt-0.5 h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Swimmer</Label>
              <Select
                value={filters.swimmerId}
                onValueChange={(v) => setFilter("swimmerId", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="w-full mt-0.5 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All swimmers</SelectItem>
                  {swimmersQ.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.swimmerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Group</Label>
              <Select
                value={filters.groupId}
                onValueChange={(v) => setFilter("groupId", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="w-full mt-0.5 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All groups</SelectItem>
                  {groupsQ.data?.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.groupName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Style</Label>
              <Select
                value={filters.styleId}
                onValueChange={(v) => setFilter("styleId", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="w-full mt-0.5 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All styles</SelectItem>
                  {stylesQ.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.styleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Distance</Label>
              <Select
                value={filters.distance}
                onValueChange={(v) => setFilter("distance", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="w-full mt-0.5 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All distances</SelectItem>
                  {DISTANCES.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}m
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilter("status", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="w-full mt-0.5 h-9">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="bg-card">
        <CardContent className="p-0">
          {sessionsQ.isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading sessions…
            </div>
          ) : sessionsQ.data?.length === 0 ? (
            <div className="p-10 text-center">
              <History className="size-10 mx-auto text-aqua/40 mb-2" />
              <div className="font-medium">No sessions found</div>
              <div className="text-sm text-muted-foreground mt-1">
                {hasFilters
                  ? "Try adjusting or clearing your filters."
                  : "Run a session from the Timing Console to see it here."}
              </div>
            </div>
          ) : sessionsQ.data && sessionsQ.data.length > 0 ? (
            <>
              {/* Desktop: table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Session</TableHead>
                      <TableHead>Date / Time</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Lanes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionsQ.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium max-w-[260px]">
                          <div className="truncate" title={s.sessionName}>
                            {s.sessionName}
                          </div>
                          {s.createdByName && (
                            <div className="text-xs text-muted-foreground">
                              by {s.createdByName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Calendar className="size-3 text-muted-foreground" />
                            {formatSessionDate(s.sessionDate)}
                          </div>
                          {s.sessionStartTime && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Clock className="size-3" />
                              {new Date(s.sessionStartTime).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{s.styleName ?? "—"}</TableCell>
                        <TableCell>{s.distanceMeters}m</TableCell>
                        <TableCell>
                          {s.groupName ?? (
                            <span className="text-muted-foreground italic">
                              ungrouped
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-navy/10 text-navy">
                            {s.laneCount ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "border",
                              STATUS_BADGE[s.status]
                            )}
                          >
                            {STATUS_LABEL[s.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1"
                              onClick={() => setDetailId(s.id)}
                            >
                              <Eye className="size-3.5" />
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-aqua"
                              onClick={() => handleExportOne(s)}
                              disabled={exportingRef.isExporting(s.id)}
                              aria-label="Export CSV"
                            >
                              {exportingRef.isExporting(s.id) ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                            </Button>
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setDeleteTarget(s);
                                  setDeleteConfirm("");
                                }}
                                aria-label="Delete session"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: cards */}
              <div className="lg:hidden divide-y">
                {sessionsQ.data.map((s) => (
                  <div key={s.id} className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-sm leading-snug line-clamp-2 flex-1 min-w-0">
                        {s.sessionName}
                      </div>
                      <Badge
                        className={cn("border shrink-0", STATUS_BADGE[s.status])}
                      >
                        {STATUS_LABEL[s.status]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs text-muted-foreground mb-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3" />
                        {formatSessionDate(s.sessionDate)}
                      </div>
                      <div>
                        Style:{" "}
                        <span className="text-foreground font-medium">
                          {s.styleName ?? "—"}
                        </span>
                      </div>
                      <div>
                        Distance:{" "}
                        <span className="text-foreground font-medium">
                          {s.distanceMeters}m
                        </span>
                      </div>
                      <div>
                        Group:{" "}
                        <span className="text-foreground font-medium">
                          {s.groupName ?? "—"}
                        </span>
                      </div>
                      <div>
                        Lanes:{" "}
                        <span className="text-foreground font-medium">
                          {s.laneCount ?? 0}
                        </span>
                      </div>
                      {s.createdByName && (
                        <div>
                          Coach:{" "}
                          <span className="text-foreground font-medium">
                            {s.createdByName}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-9 gap-1"
                        onClick={() => setDetailId(s.id)}
                      >
                        <Eye className="size-3.5" />
                        Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 w-9 p-0 text-aqua"
                        onClick={() => handleExportOne(s)}
                        disabled={exportingRef.isExporting(s.id)}
                        aria-label="Export CSV"
                      >
                        {exportingRef.isExporting(s.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                      </Button>
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9 p-0 text-destructive border-destructive/30"
                          onClick={() => {
                            setDeleteTarget(s);
                            setDeleteConfirm("");
                          }}
                          aria-label="Delete session"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ---- Detail Dialog ---- */}
      <Dialog
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
            <DialogDescription>
              {detailQ.data?.sessionName ?? "Loading…"}
            </DialogDescription>
          </DialogHeader>

          {detailQ.isLoading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading session…
            </div>
          ) : detailQ.data ? (
            <div className="space-y-3">
              {/* Meta */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <MetaItem
                  label="Date"
                  value={formatSessionDate(detailQ.data.sessionDate)}
                />
                <MetaItem
                  label="Style"
                  value={detailQ.data.styleName ?? "—"}
                />
                <MetaItem
                  label="Distance"
                  value={`${detailQ.data.distanceMeters}m`}
                />
                <MetaItem
                  label="Group"
                  value={detailQ.data.groupName ?? "—"}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={cn("border", STATUS_BADGE[detailQ.data.status])}
                >
                  {STATUS_LABEL[detailQ.data.status]}
                </Badge>
                {detailQ.data.createdByName && (
                  <span className="text-xs text-muted-foreground">
                    Recorded by {detailQ.data.createdByName}
                  </span>
                )}
                {detailQ.data.sessionStartTime && detailQ.data.sessionEndTime && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(detailQ.data.sessionStartTime).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                    )}{" "}
                    →{" "}
                    {new Date(detailQ.data.sessionEndTime).toLocaleTimeString(
                      [],
                      { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                    )}
                  </span>
                )}
              </div>

              {detailQ.data.remarks && (
                <div className="text-sm bg-muted/40 rounded-md p-2.5">
                  <div className="text-xs text-muted-foreground mb-0.5">
                    Remarks
                  </div>
                  {detailQ.data.remarks}
                </div>
              )}

              {/* Lanes */}
              <div>
                <div className="text-sm font-medium mb-2 flex items-center gap-2">
                  Lanes ({detailQ.data.lanes?.length ?? 0})
                </div>
                {detailQ.data.lanes && detailQ.data.lanes.length > 0 ? (
                  <ScrollArea className="h-72 rounded-md border">
                    <ul className="divide-y">
                      {detailQ.data.lanes
                        .slice()
                        .sort((a, b) => a.laneNo - b.laneNo)
                        .map((lane) => (
                          <li
                            key={lane.id}
                            className="p-2.5 flex items-start gap-2.5"
                          >
                            <div className="flex flex-col items-center min-w-[2.5rem]">
                              <span className="text-xs text-muted-foreground uppercase">
                                Lane
                              </span>
                              <span className="text-lg font-bold text-navy leading-none tabular-nums">
                                {lane.laneNo}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {lane.swimmerName ?? (
                                    <span className="text-muted-foreground italic">
                                      Unassigned
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider",
                                    lane.status === "FINISHED"
                                      ? "bg-green-100 text-green-700"
                                      : lane.status === "RUNNING"
                                      ? "bg-aqua/15 text-aqua"
                                      : lane.status === "DNF"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      LANE_STATUS_DOT[lane.status] ??
                                        "bg-muted-foreground"
                                    )}
                                  />
                                  {lane.status}
                                </span>
                              </div>
                              <div className="text-sm tabular-nums mt-0.5">
                                {lane.elapsedSeconds !== null ? (
                                  <span className="font-mono font-semibold text-navy">
                                    {formatSeconds(lane.elapsedSeconds)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    No time
                                  </span>
                                )}
                                {lane.laps && lane.laps.length > 0 && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    • {lane.laps.length} lap
                                    {lane.laps.length === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                              {lane.laps && lane.laps.length > 0 && (
                                <details className="mt-1.5">
                                  <summary className="text-xs text-aqua cursor-pointer hover:underline">
                                    Show lap splits
                                  </summary>
                                  <ol className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-xs tabular-nums">
                                    {lane.laps.map((lap) => (
                                      <li
                                        key={lap.id}
                                        className="flex justify-between gap-2"
                                      >
                                        <span className="text-muted-foreground">
                                          #{lap.lapNo}
                                        </span>
                                        <span className="font-mono">
                                          {formatSeconds(lap.lapTimeSeconds)}
                                        </span>
                                        <span className="text-muted-foreground font-mono">
                                          ({formatSeconds(lap.cumulativeSeconds)}
                                          )
                                        </span>
                                      </li>
                                    ))}
                                  </ol>
                                </details>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </ScrollArea>
                ) : (
                  <div className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-md text-center">
                    No lanes recorded for this session.
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="gap-2 mr-auto"
                  onClick={() => handleExportOne(detailQ.data!)}
                  disabled={exportingRef.isExporting(detailQ.data!.id)}
                >
                  {exportingRef.isExporting(detailQ.data!.id) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Export CSV
                </Button>
                <Button onClick={() => setDetailId(null)}>Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Session not found.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Delete Confirm ---- */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.sessionName}
              </span>{" "}
              and all its lanes and laps. To confirm, type{" "}
              <span className="font-mono font-semibold text-foreground">
                DELETE SESSION
              </span>{" "}
              below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE SESSION"
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={
                deleteMut.isPending || deleteConfirm !== "DELETE SESSION"
              }
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                if (deleteConfirm !== "DELETE SESSION") {
                  toast.error("Type DELETE SESSION to confirm");
                  return;
                }
                deleteMut.mutate(deleteTarget.id);
              }}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete Session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  );
}

// ============================================================
// HOOKS
// ============================================================
function useExportTracker() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  return {
    isExporting: (id: string) => ids.has(id),
    start: (id: string) => setIds((s) => new Set(s).add(id)),
    stop: (id: string) =>
      setIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      }),
  };
}

// ============================================================
// CSV HELPERS
// ============================================================
const CSV_HEADER =
  "Session,Lane,Swimmer,Style,Distance,Time,LapCount,Status";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sessionToCsvRows(s: SessionDetailDTO): string[] {
  const rows: string[] = [];
  const lanes = (s.lanes ?? []).slice().sort((a, b) => a.laneNo - b.laneNo);
  if (lanes.length === 0) {
    // Emit one row with empty lane so the session is still represented
    rows.push(
      [
        csvEscape(s.sessionName),
        "",
        "",
        csvEscape(s.styleName ?? ""),
        csvEscape(s.distanceMeters),
        "",
        csvEscape(0),
        csvEscape(s.status),
      ].join(",")
    );
    return rows;
  }
  for (const lane of lanes) {
    const lapCount = lane.laps?.length ?? 0;
    const time =
      lane.elapsedSeconds !== null ? formatSeconds(lane.elapsedSeconds) : "";
    rows.push(
      [
        csvEscape(s.sessionName),
        csvEscape(lane.laneNo),
        csvEscape(lane.swimmerName ?? ""),
        csvEscape(s.styleName ?? ""),
        csvEscape(s.distanceMeters),
        csvEscape(time),
        csvEscape(lapCount),
        csvEscape(lane.status),
      ].join(",")
    );
  }
  return rows;
}

function sessionToCsv(s: SessionDetailDTO): string {
  return [CSV_HEADER, ...sessionToCsvRows(s)].join("\n");
}

function csvFilename(s: SessionDetailDTO): string {
  const safe = s.sessionName
    .replace(/[^a-z0-9\-_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const date = new Date(s.sessionDate).toISOString().slice(0, 10);
  return `lanepulse-${date}-${safe || "session"}.csv`;
}

function downloadCsv(csv: string, filename: string) {
  // Prepend BOM for Excel friendliness
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatSessionDate(iso: string): string {
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
