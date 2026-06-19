"use client";

// LanePulse Pro - Swimmer Master (Task 5)

import { useEffect, useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useQueries,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { canManageSwimmers, canDeleteEverything, formatSeconds } from "@/lib/helpers";
import { cn } from "@/lib/utils";
import type {
  SwimmerDTO,
  Gender,
  TrainingSessionDTO,
  SessionLaneDTO,
} from "@/lib/types";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Eye,
  Power,
  Trash2,
  AlertTriangle,
  Trophy,
  CalendarDays,
  History,
  Waves,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

interface BestTime {
  styleId: string;
  styleName: string;
  distanceMeters: number;
  bestSeconds: number;
  bestText: string;
  sessionDate: string;
}

interface SwimmerHistory {
  recentSessions: TrainingSessionDTO[];
  bestTimes: BestTime[];
  totalSessions: number;
}

type SwimmerProfile = SwimmerDTO & { history: SwimmerHistory };

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const GENDER_LABEL: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------
// Form state
// ---------------------------------------------------------------

interface FormState {
  swimmerName: string;
  age: string;
  gender: "" | Gender;
  dateOfBirth: string;
  remarks: string;
}

function emptyForm(): FormState {
  return {
    swimmerName: "",
    age: "",
    gender: "",
    dateOfBirth: "",
    remarks: "",
  };
}

function formFromSwimmer(s: SwimmerDTO): FormState {
  return {
    swimmerName: s.swimmerName,
    age: s.age != null ? String(s.age) : "",
    gender: s.gender ?? "",
    dateOfBirth: toDateInputValue(s.dateOfBirth),
    remarks: s.remarks ?? "",
  };
}

// ---------------------------------------------------------------
// Add / Edit Dialog
// ---------------------------------------------------------------

function SwimmerFormDialog({
  open,
  onOpenChange,
  editTarget,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget: SwimmerDTO | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevEditTarget, setPrevEditTarget] = useState<SwimmerDTO | null>(
    editTarget
  );

  // Sync form whenever opened or target changes (React-recommended
  // "adjusting state when a prop changes" pattern — avoids useEffect).
  if (open !== prevOpen || editTarget !== prevEditTarget) {
    setPrevOpen(open);
    setPrevEditTarget(editTarget);
    if (open) {
      setForm(editTarget ? formFromSwimmer(editTarget) : emptyForm());
    }
  }

  const mutation = useMutation({
    mutationFn: async (data: FormState) => {
      const payload = {
        swimmerName: data.swimmerName.trim(),
        age: data.age === "" ? null : Number(data.age),
        gender: data.gender === "" ? null : data.gender,
        dateOfBirth: data.dateOfBirth === "" ? null : data.dateOfBirth,
        remarks: data.remarks.trim() || null,
      };
      if (editTarget) {
        return api.patch<SwimmerDTO>(`/api/swimmers/${editTarget.id}`, payload);
      }
      return api.post<SwimmerDTO>("/api/swimmers", payload);
    },
    onSuccess: (swimmer) => {
      toast.success(
        editTarget
          ? `Updated swimmer "${swimmer.swimmerName}"`
          : `Added swimmer "${swimmer.swimmerName}"`
      );
      qc.invalidateQueries({ queryKey: ["swimmers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save swimmer");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.swimmerName.trim()) {
      toast.error("Swimmer name is required");
      return;
    }
    if (form.age !== "" && (isNaN(Number(form.age)) || Number(form.age) < 0)) {
      toast.error("Age must be a non-negative number");
      return;
    }
    mutation.mutate(form);
  };

  const isEdit = !!editTarget;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="size-5 text-aqua" />
            ) : (
              <UserPlus className="size-5 text-aqua" />
            )}
            {isEdit ? "Edit Swimmer" : "Add Swimmer"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this swimmer's profile information."
              : "Register a new swimmer on the team."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="swimmerName">
              Swimmer Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="swimmerName"
              value={form.swimmerName}
              onChange={(e) =>
                setForm((f) => ({ ...f, swimmerName: e.target.value }))
              }
              placeholder="e.g. Alex Morgan"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                min={0}
                max={120}
                value={form.age}
                onChange={(e) =>
                  setForm((f) => ({ ...f, age: e.target.value }))
                }
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select
                value={form.gender || "—"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    gender: v === "—" ? "" : (v as Gender),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="—">—</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) =>
                setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={form.remarks}
              onChange={(e) =>
                setForm((f) => ({ ...f, remarks: e.target.value }))
              }
              placeholder="Notes about stroke specialty, training focus, etc."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : isEdit
                  ? "Save Changes"
                  : "Add Swimmer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Profile Sheet (with best times, recent sessions, danger zone)
// ---------------------------------------------------------------

function ProfileSheet({
  swimmerId,
  open,
  onOpenChange,
  onEdit,
}: {
  swimmerId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (s: SwimmerDTO) => void;
}) {
  const qc = useQueryClient();
  const user = useAppStore((s) => s.user);
  const canManage = canManageSwimmers(user?.role);
  const canDelete = canDeleteEverything(user?.role);

  const profileQ = useQuery({
    queryKey: ["swimmer-profile", swimmerId],
    enabled: !!swimmerId && open,
    queryFn: () => api.get<SwimmerProfile>(`/api/swimmers/${swimmerId}`),
  });

  // Fetch each recent session's detail to find this swimmer's lane resultText
  const sessionDetailsQ = useQueries({
    queries: (profileQ.data?.history.recentSessions ?? []).map((s) => ({
      queryKey: ["session-detail-for-swimmer", s.id, swimmerId],
      queryFn: () =>
        api.get<TrainingSessionDTO & { lanes: SessionLaneDTO[] }>(
          `/api/sessions/${s.id}`
        ),
      enabled: !!swimmerId && open && !!profileQ.data,
      staleTime: 60_000,
    })),
  });

  const laneResultBySession = useMemo(() => {
    const map = new Map<string, { resultText: string | null; status: string }>();
    sessionDetailsQ.forEach((q) => {
      const detail = q.data as
        | (TrainingSessionDTO & { lanes: SessionLaneDTO[] })
        | undefined;
      if (!detail || !swimmerId) return;
      const lane = detail.lanes?.find((l) => l.swimmerId === swimmerId);
      if (lane) {
        map.set(detail.id, {
          resultText: lane.resultText,
          status: lane.status,
        });
      }
    });
    return map;
  }, [sessionDetailsQ, swimmerId]);

  // --- Mutations ---
  const deactivateMut = useMutation({
    mutationFn: (id: string) =>
      api.patch<SwimmerDTO>(`/api/swimmers/${id}`, { activeStatus: false }),
    onSuccess: (s) => {
      toast.success(`Deactivated "${s.swimmerName}"`);
      qc.invalidateQueries({ queryKey: ["swimmers"] });
      qc.invalidateQueries({ queryKey: ["swimmer-profile", s.id] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to deactivate"),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) =>
      api.patch<SwimmerDTO>(`/api/swimmers/${id}`, { activeStatus: true }),
    onSuccess: (s) => {
      toast.success(`Reactivated "${s.swimmerName}"`);
      qc.invalidateQueries({ queryKey: ["swimmers"] });
      qc.invalidateQueries({ queryKey: ["swimmer-profile", s.id] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reactivate"),
  });

  const permanentDeleteMut = useMutation({
    mutationFn: (id: string) =>
      api.del<{ success: boolean }>(`/api/swimmers/${id}`, {
        permanent: true,
        confirm: "DELETE SWIMMER",
      }),
    onSuccess: () => {
      toast.success("Swimmer permanently deleted");
      qc.invalidateQueries({ queryKey: ["swimmers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete swimmer");
    },
  });

  const swimmer = profileQ.data;
  const [confirmText, setConfirmText] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);
  // Reset confirm text whenever sheet opens (React "adjusting state when a
  // prop changes" pattern — avoids useEffect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setConfirmText("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        <SheetHeader className="p-4 border-b bg-navy text-white shrink-0">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Users className="size-5 text-aqua" />
            Swimmer Profile
          </SheetTitle>
          <SheetDescription className="text-white/70">
            Full history, best times &amp; danger zone.
          </SheetDescription>
        </SheetHeader>

        {profileQ.isLoading && (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {profileQ.isError && (
          <div className="p-4 text-sm text-destructive">
            Failed to load swimmer profile.
          </div>
        )}

        {swimmer && !profileQ.isLoading && (
          <ScrollArea className="flex-1 lp-scroll">
            <div className="p-4 space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="size-14 rounded-full bg-aqua/15 text-aqua flex items-center justify-center shrink-0 text-xl font-bold">
                  {swimmer.swimmerName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold leading-tight truncate">
                    {swimmer.swimmerName}
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {swimmer.age != null && (
                      <Badge variant="secondary" className="bg-muted">
                        {swimmer.age} yrs
                      </Badge>
                    )}
                    {swimmer.gender && (
                      <Badge variant="secondary" className="bg-muted">
                        {GENDER_LABEL[swimmer.gender]}
                      </Badge>
                    )}
                    {swimmer.activeStatus ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                        <CheckCircle2 className="size-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        <XCircle className="size-3" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <CalendarDays className="size-3" />
                    Added {formatDateShort(swimmer.createdAt)}
                    {swimmer.dateOfBirth && (
                      <>
                        <span className="text-border mx-1">•</span>
                        DOB {formatDateShort(swimmer.dateOfBirth)}
                      </>
                    )}
                  </div>
                  {swimmer.remarks && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      &ldquo;{swimmer.remarks}&rdquo;
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(swimmer)}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  {swimmer.activeStatus ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateMut.mutate(swimmer.id)}
                      disabled={deactivateMut.isPending}
                      className="text-amber-700 border-amber-200 hover:bg-amber-50"
                    >
                      <Power className="size-4" />
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reactivateMut.mutate(swimmer.id)}
                      disabled={reactivateMut.isPending}
                      className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    >
                      <Power className="size-4" />
                      Reactivate
                    </Button>
                  )}
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded-lg p-3 text-center bg-muted/30">
                  <div className="text-2xl font-bold text-navy lp-timer-digits">
                    {swimmer.history.totalSessions}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Total Sessions
                  </div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-muted/30">
                  <div className="text-2xl font-bold text-navy lp-timer-digits">
                    {swimmer.history.bestTimes.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Best Time Records
                  </div>
                </div>
                <div className="border rounded-lg p-3 text-center bg-muted/30">
                  <div className="text-2xl font-bold text-navy lp-timer-digits">
                    {swimmer.history.recentSessions.length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Recent Sessions
                  </div>
                </div>
              </div>

              {/* Best times table */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Trophy className="size-4 text-amber-500" />
                  Best Times
                </h4>
                {swimmer.history.bestTimes.length === 0 ? (
                  <div className="text-sm text-muted-foreground border rounded-md bg-muted/30 p-4 text-center">
                    No finished sessions recorded yet.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Style</TableHead>
                          <TableHead className="text-right">Distance</TableHead>
                          <TableHead className="text-right">Best</TableHead>
                          <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {swimmer.history.bestTimes.map((bt) => (
                          <TableRow key={`${bt.styleId}-${bt.distanceMeters}`}>
                            <TableCell className="font-medium">
                              {bt.styleName}
                            </TableCell>
                            <TableCell className="text-right">
                              {bt.distanceMeters}m
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold lp-timer-digits">
                              {bt.bestText}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs">
                              {formatDateShort(bt.sessionDate)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Recent sessions */}
              <div>
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <History className="size-4 text-aqua" />
                  Recent Sessions
                </h4>
                {swimmer.history.recentSessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground border rounded-md bg-muted/30 p-4 text-center">
                    No session history yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto lp-scroll pr-1">
                    {swimmer.history.recentSessions.map((s) => {
                      const lane = laneResultBySession.get(s.id);
                      return (
                        <div
                          key={s.id}
                          className="border rounded-lg p-2.5 flex items-center gap-3"
                        >
                          <div className="size-9 rounded-md bg-navy/10 text-navy flex items-center justify-center shrink-0">
                            <Waves className="size-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {s.sessionName}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {formatDateShort(s.sessionDate)} •{" "}
                              {s.styleName ?? "—"} • {s.distanceMeters}m
                              {s.groupName ? ` • ${s.groupName}` : ""}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {lane?.resultText ? (
                              <>
                                <div className="text-sm font-mono font-semibold lp-timer-digits">
                                  {lane.resultText}
                                </div>
                                <div className="text-[10px] text-muted-foreground uppercase">
                                  {lane.status}
                                </div>
                              </>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                {lane?.status ?? "—"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              {canDelete && (
                <div className="border border-destructive/40 rounded-lg bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="size-4" />
                    <h4 className="text-sm font-semibold">Danger Zone</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Permanently deleting a swimmer removes them entirely from
                    the database. This only works if the swimmer has no
                    session lanes or laps recorded. Otherwise, deactivate them
                    instead.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="confirmText" className="text-xs">
                      Type{" "}
                      <code className="font-mono bg-destructive/10 px-1 py-0.5 rounded">
                        DELETE SWIMMER
                      </code>{" "}
                      to confirm
                    </Label>
                    <Input
                      id="confirmText"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE SWIMMER"
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={
                      confirmText !== "DELETE SWIMMER" ||
                      permanentDeleteMut.isPending
                    }
                    onClick={() => permanentDeleteMut.mutate(swimmer.id)}
                  >
                    <Trash2 className="size-4" />
                    {permanentDeleteMut.isPending
                      ? "Deleting…"
                      : "Permanently Delete Swimmer"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Deactivate confirm dialog (used from list)
// ---------------------------------------------------------------

function DeactivateConfirmDialog({
  swimmer,
  open,
  onOpenChange,
}: {
  swimmer: SwimmerDTO | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (id: string) =>
      api.patch<SwimmerDTO>(`/api/swimmers/${id}`, { activeStatus: false }),
    onSuccess: (s) => {
      toast.success(`Deactivated "${s.swimmerName}"`);
      qc.invalidateQueries({ queryKey: ["swimmers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to deactivate"),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Deactivate swimmer?
          </AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{swimmer?.swimmerName}&rdquo; will be marked inactive. They
            will no longer appear in active lists or be assignable to new
            sessions. Their session history is preserved. You can reactivate
            them from their profile.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mut.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={mut.isPending || !swimmer}
            onClick={(e) => {
              e.preventDefault();
              if (swimmer) mut.mutate(swimmer.id);
            }}
          >
            {mut.isPending ? "Deactivating…" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------
// Swimmer card
// ---------------------------------------------------------------

function SwimmerCard({
  swimmer,
  canManage,
  onView,
  onEdit,
  onDeactivate,
}: {
  swimmer: SwimmerDTO;
  canManage: boolean;
  onView: (s: SwimmerDTO) => void;
  onEdit: (s: SwimmerDTO) => void;
  onDeactivate: (s: SwimmerDTO) => void;
}) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <CardContent className="pt-5 flex-1 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-full bg-aqua/15 text-aqua flex items-center justify-center shrink-0 font-bold text-lg">
            {swimmer.swimmerName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base truncate">
                {swimmer.swimmerName}
              </h3>
              {swimmer.activeStatus ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                  Active
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-muted text-muted-foreground text-[10px]"
                >
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {swimmer.age != null && (
                <Badge variant="outline" className="text-[10px]">
                  {swimmer.age} yrs
                </Badge>
              )}
              {swimmer.gender && (
                <Badge variant="outline" className="text-[10px]">
                  {GENDER_LABEL[swimmer.gender]}
                </Badge>
              )}
              {swimmer.dateOfBirth && (
                <Badge variant="outline" className="text-[10px]">
                  DOB {formatDateShort(swimmer.dateOfBirth)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Remarks */}
        {swimmer.remarks ? (
          <p className="text-sm text-muted-foreground line-clamp-2 italic">
            &ldquo;{swimmer.remarks}&rdquo;
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">
            No remarks.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-auto pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView(swimmer)}
            className="flex-1 min-w-[110px]"
          >
            <Eye className="size-4" />
            View Profile
          </Button>
          {canManage && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(swimmer)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              {swimmer.activeStatus && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeactivate(swimmer)}
                  className="text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  <Power className="size-4" />
                  Deactivate
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------
// Main view
// ---------------------------------------------------------------

export function SwimmersView() {
  const user = useAppStore((s) => s.user);
  const canManage = canManageSwimmers(user?.role);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const swimmersQ = useQuery({
    queryKey: ["swimmers", "list", search, activeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activeFilter === "active") params.set("active", "true");
      else if (activeFilter === "inactive") params.set("active", "false");
      const qs = params.toString();
      return api.get<SwimmerDTO[]>(`/api/swimmers${qs ? `?${qs}` : ""}`);
    },
  });

  // --- dialog state ---
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SwimmerDTO | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<SwimmerDTO | null>(
    null
  );
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const openAdd = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (s: SwimmerDTO) => {
    setEditTarget(s);
    setFormOpen(true);
  };

  const openProfile = (s: SwimmerDTO) => {
    setProfileId(s.id);
    setProfileOpen(true);
  };

  const openDeactivate = (s: SwimmerDTO) => {
    setDeactivateTarget(s);
    setDeactivateOpen(true);
  };

  const swimmers = swimmersQ.data ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="size-7 text-aqua" />
            Swimmers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your team roster. {canManage ? "Add, edit and deactivate swimmers." : "Read-only access."}
          </p>
        </div>
        {canManage && (
          <Button onClick={openAdd} size="lg" className="h-10">
            <UserPlus className="size-4" />
            Add Swimmer
          </Button>
        )}
      </div>

      {/* Search + filter bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name…"
                className="pl-9 h-10"
              />
            </div>
            <Select
              value={activeFilter}
              onValueChange={(v) =>
                setActiveFilter(v as "all" | "active" | "inactive")
              }
            >
              <SelectTrigger className="w-full sm:w-44 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All swimmers</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {swimmersQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : swimmersQ.isError ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-destructive">
            Failed to load swimmers. {(swimmersQ.error as Error)?.message}
          </CardContent>
        </Card>
      ) : swimmers.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-12 text-center">
            <div className="size-14 rounded-full bg-aqua/10 text-aqua flex items-center justify-center mx-auto mb-3">
              <Users className="size-7" />
            </div>
            <h3 className="font-semibold text-lg">
              {search || activeFilter !== "all"
                ? "No swimmers match your filters"
                : "No swimmers yet"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {search || activeFilter !== "all"
                ? "Try adjusting your search or filter."
                : "Get started by adding your first swimmer to the roster."}
            </p>
            {canManage && !search && activeFilter === "all" && (
              <Button onClick={openAdd} size="lg">
                <UserPlus className="size-4" />
                Add Swimmer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {swimmers.length} swimmer{swimmers.length !== 1 ? "s" : ""} found
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {swimmers.map((s) => (
              <SwimmerCard
                key={s.id}
                swimmer={s}
                canManage={canManage}
                onView={openProfile}
                onEdit={openEdit}
                onDeactivate={openDeactivate}
              />
            ))}
          </div>
        </>
      )}

      {/* Dialogs */}
      <SwimmerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editTarget={editTarget}
      />

      <ProfileSheet
        swimmerId={profileId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onEdit={(s) => {
          setProfileOpen(false);
          // slight delay so sheet closing animation doesn't conflict with dialog open
          setTimeout(() => openEdit(s), 50);
        }}
      />

      <DeactivateConfirmDialog
        swimmer={deactivateTarget}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </div>
  );
}
