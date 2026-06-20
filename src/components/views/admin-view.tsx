"use client";

// LanePulse Pro - Admin Maintenance (SUPER_ADMIN only)

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Ban,
  Database,
  HeartHandshake,
  History,
  Link2,
  Loader2,
  Plus,
  Shield,
  ShieldAlert,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { canManageUsers, canDeleteEverything } from "@/lib/helpers";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type {
  AuditLogDTO,
  ParentSwimmerDTO,
  Role,
  SwimmerDTO,
  TrainingSessionDTO,
  UserDTO,
} from "@/lib/types";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================
// Role helpers
// ============================================================
function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, string> = {
    SUPER_ADMIN: "bg-aqua/15 text-aqua border-aqua/30",
    COACH: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    VIEWER: "bg-muted text-muted-foreground border-border",
    PARENT: "bg-pink-500/15 text-pink-700 border-pink-500/30 dark:text-pink-300",
  };
  return (
    <Badge variant="outline" className={cn("border", map[role])}>
      {role.replace("_", " ")}
    </Badge>
  );
}

// ============================================================
// Stats card
// ============================================================
function StatsCard() {
  const { data, isLoading } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<{ counts: Record<string, number> }>("/api/admin/stats"),
  });

  const counts = data?.counts;
  const items: { key: string; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "swimmers", label: "Swimmers" },
    { key: "styles", label: "Styles" },
    { key: "groups", label: "Groups" },
    { key: "sessions", label: "Sessions" },
    { key: "sessionLanes", label: "Session Lanes" },
    { key: "sessionLaps", label: "Session Laps" },
    { key: "performanceNotes", label: "Performance Notes" },
    { key: "auditLogs", label: "Audit Logs" },
  ];

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4 text-aqua" />
          Table Counts
        </CardTitle>
        <CardDescription>Row counts across the live database.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((it) => (
              <div
                key={it.key}
                className="rounded-lg border bg-card p-3 hover:border-aqua/40 transition-colors"
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {it.label}
                </div>
                <div className="text-2xl font-bold mt-1 lp-timer-digits">
                  {counts?.[it.key] ?? 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Audit log card
// ============================================================
function AuditCard() {
  const { data, isLoading } = useQuery<AuditLogDTO[]>({
    queryKey: ["admin", "audit", 50],
    queryFn: () => api.get<AuditLogDTO[]>("/api/admin/audit?limit=50"),
  });

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-aqua" />
          Recent Audit Log
        </CardTitle>
        <CardDescription>Last 50 administrative actions.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            No audit log entries yet.
          </div>
        ) : (
          <ScrollArea className="h-96 rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.userName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-aqua/10 text-aqua border-aqua/30 text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{log.tableName}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground font-mono">
                      {log.recordId ? log.recordId.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {log.details ?? ""}
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
// Danger Zone
// ============================================================
function DangerRow({
  title,
  description,
  confirmText,
  open,
  onOpenChange,
  value,
  onValueChange,
  onConfirm,
  isPending,
  extra,
  icon: Icon = Trash2,
}: {
  title: string;
  description: string;
  confirmText: string;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  value: string;
  onValueChange: (s: string) => void;
  onConfirm: () => void;
  isPending: boolean;
  extra?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-red-500/15 p-2 shrink-0">
          <Icon className="size-4 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="mt-3"
            onClick={() => onOpenChange(true)}
          >
            <AlertTriangle className="size-3.5" />
            Open
          </Button>
        </div>
      </div>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {description}
              <br />
              Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{confirmText}</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {extra}
          <div className="space-y-1.5">
            <Label className="text-xs">Confirmation</Label>
            <Input
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder={confirmText}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={value !== confirmText || isPending}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DangerZoneCard() {
  const qc = useQueryClient();
  const [sessionOpen, setSessionOpen] = useState(false);
  const [clearSessionsOpen, setClearSessionsOpen] = useState(false);
  const [clearGroupsOpen, setClearGroupsOpen] = useState(false);
  const [clearTrainingOpen, setClearTrainingOpen] = useState(false);

  // Session picker for "delete selected session"
  const sessionsQ = useQuery<TrainingSessionDTO[]>({
    queryKey: ["sessions", "all"],
    queryFn: () => api.get<TrainingSessionDTO[]>("/api/sessions"),
    enabled: sessionOpen,
  });

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [sessionConfirm, setSessionConfirm] = useState("");
  const [clearSessionsConfirm, setClearSessionsConfirm] = useState("");
  const [clearGroupsConfirm, setClearGroupsConfirm] = useState("");
  const [clearTrainingConfirm, setClearTrainingConfirm] = useState("");

  const deleteSessionMu = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/sessions/${id}`, { confirm: "DELETE SESSION" }),
    onSuccess: () => {
      toast.success("Session deleted.");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setSessionOpen(false);
      setSelectedSessionId("");
      setSessionConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearSessionsMu = useMutation({
    mutationFn: () =>
      api.post("/api/admin/clear-sessions", { confirm: "CLEAR DATA" }),
    onSuccess: (r: any) => {
      toast.success(
        `Cleared ${r.deleted?.sessions ?? 0} session(s), ${r.deleted?.sessionLanes ?? 0} lane(s), ${r.deleted?.sessionLaps ?? 0} lap(s).`
      );
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
      setClearSessionsOpen(false);
      setClearSessionsConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearGroupsMu = useMutation({
    mutationFn: () =>
      api.post("/api/admin/clear-groups", { confirm: "CLEAR GROUPS" }),
    onSuccess: () => {
      toast.success("All groups cleared.");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
      setClearGroupsOpen(false);
      setClearGroupsConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearTrainingMu = useMutation({
    mutationFn: () =>
      api.post("/api/admin/clear-training-data", { confirm: "CLEAR DATA" }),
    onSuccess: () => {
      toast.success("All training data cleared (users + styles kept).");
      qc.invalidateQueries();
      setClearTrainingOpen(false);
      setClearTrainingConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-red-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
          <ShieldAlert className="size-4" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Destructive operations. Each action requires typed confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DangerRow
          title="Delete Selected Session"
          description="Permanently delete a single training session and its lanes/laps."
          confirmText="DELETE SESSION"
          open={sessionOpen}
          onOpenChange={(b) => {
            setSessionOpen(b);
            if (b) {
              setSessionConfirm("");
              setSelectedSessionId("");
            }
          }}
          value={sessionConfirm}
          onValueChange={setSessionConfirm}
          onConfirm={() => {
            if (!selectedSessionId) {
              toast.error("Pick a session first.");
              return;
            }
            deleteSessionMu.mutate(selectedSessionId);
          }}
          isPending={deleteSessionMu.isPending}
          extra={
            <div className="space-y-1.5">
              <Label className="text-xs">Session</Label>
              <Select
                value={selectedSessionId}
                onValueChange={setSelectedSessionId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {(sessionsQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.sessionName} ({s.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <DangerRow
          title="Clear All Session Results"
          description="Delete every training session and all associated lanes/laps. Swimmers, groups, users and styles remain."
          confirmText="CLEAR DATA"
          open={clearSessionsOpen}
          onOpenChange={(b) => {
            setClearSessionsOpen(b);
            if (b) setClearSessionsConfirm("");
          }}
          value={clearSessionsConfirm}
          onValueChange={setClearSessionsConfirm}
          onConfirm={() => clearSessionsMu.mutate()}
          isPending={clearSessionsMu.isPending}
        />

        <DangerRow
          title="Clear All Groups"
          description="Remove all training groups and group member assignments. Hard-deletes groups with no sessions; soft-deletes others."
          confirmText="CLEAR GROUPS"
          open={clearGroupsOpen}
          onOpenChange={(b) => {
            setClearGroupsOpen(b);
            if (b) setClearGroupsConfirm("");
          }}
          value={clearGroupsConfirm}
          onValueChange={setClearGroupsConfirm}
          onConfirm={() => clearGroupsMu.mutate()}
          isPending={clearGroupsMu.isPending}
        />

        <DangerRow
          title="Clear All Training Data"
          description="Delete everything except users and swimming styles (laps, lanes, sessions, groups, swimmers, performance notes)."
          confirmText="CLEAR DATA"
          open={clearTrainingOpen}
          onOpenChange={(b) => {
            setClearTrainingOpen(b);
            if (b) setClearTrainingConfirm("");
          }}
          value={clearTrainingConfirm}
          onValueChange={setClearTrainingConfirm}
          onConfirm={() => clearTrainingMu.mutate()}
          isPending={clearTrainingMu.isPending}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================
// User Management
// ============================================================
interface UserFormState {
  fullName: string;
  email: string;
  username: string;
  password: string;
  role: Role;
  isActive: boolean;
}

function emptyUserForm(): UserFormState {
  return {
    fullName: "",
    email: "",
    username: "",
    password: "",
    role: "VIEWER",
    isActive: true,
  };
}

function UserManagementCard() {
  const qc = useQueryClient();
  const user = useAppStore((s) => s.user);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyUserForm());
  const [deleteTarget, setDeleteTarget] = useState<UserDTO | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const usersQ = useQuery<UserDTO[]>({
    queryKey: ["users"],
    queryFn: () => api.get<UserDTO[]>("/api/users"),
  });

  const createMu = useMutation({
    mutationFn: (body: UserFormState) =>
      api.post<UserDTO>("/api/users", body),
    onSuccess: () => {
      toast.success("User created.");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMu = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserFormState> }) =>
      api.patch<UserDTO>(`/api/users/${id}`, body),
    onSuccess: () => {
      toast.success("User updated.");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMu = useMutation({
    mutationFn: ({ id, hard }: { id: string; hard: boolean }) =>
      api.del(`/api/users/${id}`, hard ? { confirm: "DELETE USER" } : undefined),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.hard ? "User permanently deleted." : "User deactivated."
      );
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDeleteTarget(null);
      setDeleteConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyUserForm());
    setDialogOpen(true);
  }

  function openEdit(u: UserDTO) {
    setEditing(u);
    setForm({
      fullName: u.fullName,
      email: u.email,
      username: u.username,
      password: "",
      role: u.role,
      isActive: u.isActive,
    });
    setDialogOpen(true);
  }

  function submit() {
    if (editing) {
      const patch: Partial<UserFormState> = {
        fullName: form.fullName,
        email: form.email,
        username: form.username,
        role: form.role,
        isActive: form.isActive,
      };
      if (form.password) patch.password = form.password;
      patchMu.mutate({ id: editing.id, body: patch });
    } else {
      if (!form.password) {
        toast.error("Password is required for new users.");
        return;
      }
      createMu.mutate(form);
    }
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="size-4 text-aqua" />
              User Management
            </CardTitle>
            <CardDescription>
              Create, edit and deactivate user accounts.
            </CardDescription>
          </div>
          <Button
            className="bg-aqua text-white hover:bg-aqua/90"
            onClick={openCreate}
          >
            <UserPlus className="size-4" /> Add User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {usersQ.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (usersQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            No users found.
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto lp-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQ.data ?? []).map((u) => {
                  const isSelf = user?.id === u.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.fullName}
                        {isSelf && (
                          <Badge variant="outline" className="ml-2 text-[10px] bg-aqua/10 text-aqua border-aqua/30">
                            you
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{u.username}</TableCell>
                      <TableCell className="text-xs">{u.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell>
                        {u.isActive ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(u)}
                          >
                            <UserCog className="size-3.5" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                            onClick={() => {
                              if (isSelf) {
                                toast.error("Cannot delete your own account.");
                                return;
                              }
                              setDeleteTarget(u);
                              setDeleteConfirm("");
                            }}
                          >
                            <Ban className="size-3.5" /> Deactivate
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.fullName}` : "Add User"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave password blank to keep the current password."
                : "Create a new user account with a role."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Password {editing && "(leave blank to keep)"}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "••••••" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as Role })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="COACH">Coach</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="PARENT">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-xs">Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(b) => setForm({ ...form, isActive: b })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMu.isPending || patchMu.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-aqua text-white hover:bg-aqua/90"
              onClick={submit}
              disabled={createMu.isPending || patchMu.isPending}
            >
              {createMu.isPending || patchMu.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {editing ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete / Deactivate dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(b) => {
          if (!b) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove user "{deleteTarget?.fullName}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              By default the user will be deactivated (soft-delete). To permanently
              delete, type <span className="font-mono font-bold text-red-600 dark:text-red-400">DELETE USER</span>.
              Permanent delete only works if the user has no audit logs and has not created any sessions.
              {user?.id === deleteTarget?.id && (
                <span className="block mt-2 text-red-600 dark:text-red-400 font-medium">
                  You cannot delete your own account.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Type DELETE USER to permanently delete (or leave blank to deactivate)
            </Label>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE USER"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={
                deleteMu.isPending ||
                user?.id === deleteTarget?.id
              }
              onClick={(e) => {
                e.preventDefault();
                if (!deleteTarget) return;
                deleteMu.mutate({
                  id: deleteTarget.id,
                  hard: deleteConfirm === "DELETE USER",
                });
              }}
            >
              {deleteMu.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              {deleteConfirm === "DELETE USER"
                ? "Permanently Delete"
                : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================
// Parent Access Management
// ============================================================
function ParentAccessCard() {
  const qc = useQueryClient();
  const [parentUserId, setParentUserId] = useState<string>("");
  const [swimmerId, setSwimmerId] = useState<string>("");
  const [removeTarget, setRemoveTarget] = useState<ParentSwimmerDTO | null>(
    null
  );

  // Current parent-swimmer mappings
  const accessQ = useQuery<ParentSwimmerDTO[]>({
    queryKey: ["admin", "parent-access"],
    queryFn: () => api.get<ParentSwimmerDTO[]>("/api/admin/parent-access"),
  });

  // Reuse users list (already cached by UserManagementCard)
  const usersQ = useQuery<UserDTO[]>({
    queryKey: ["users"],
    queryFn: () => api.get<UserDTO[]>("/api/users"),
  });

  // Active swimmers for the assign form
  const swimmersQ = useQuery<SwimmerDTO[]>({
    queryKey: ["swimmers", "list", "", "active"],
    queryFn: () => api.get<SwimmerDTO[]>("/api/swimmers?active=true"),
  });

  const parentUsers = (usersQ.data ?? []).filter(
    (u) => u.role === "PARENT" && u.isActive
  );
  const activeSwimmers = swimmersQ.data ?? [];

  const assignMu = useMutation({
    mutationFn: (body: { parentUserId: string; swimmerId: string }) =>
      api.post<ParentSwimmerDTO>("/api/admin/parent-access", body),
    onSuccess: () => {
      toast.success("Parent access assigned.");
      qc.invalidateQueries({ queryKey: ["admin", "parent-access"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setParentUserId("");
      setSwimmerId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMu = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/parent-access/${id}`),
    onSuccess: () => {
      toast.success("Parent access removed.");
      qc.invalidateQueries({ queryKey: ["admin", "parent-access"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setRemoveTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submitAssign() {
    if (!parentUserId) {
      toast.error("Pick a parent user first.");
      return;
    }
    if (!swimmerId) {
      toast.error("Pick a swimmer first.");
      return;
    }
    assignMu.mutate({ parentUserId, swimmerId });
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartHandshake className="size-4 text-aqua" />
              Parent Access Management
            </CardTitle>
            <CardDescription>
              Grant Parent-role users access to view a specific swimmer&apos;s
              progress in the Parent Portal.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assign form */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="size-4 text-aqua" />
            Assign New Access
          </div>
          {parentUsers.length === 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              No Parent-role users found. Create a Parent-role user first in
              User Management above.
            </div>
          ) : activeSwimmers.length === 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              No active swimmers found. Add a swimmer first.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Parent User</Label>
                <Select value={parentUserId} onValueChange={setParentUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select parent user" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Swimmer</Label>
                <Select value={swimmerId} onValueChange={setSwimmerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select swimmer" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSwimmers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.swimmerName}
                        {s.age !== null ? ` (${s.age}y)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {parentUsers.length > 0 && activeSwimmers.length > 0 && (
            <div className="flex justify-end">
              <Button
                className="bg-aqua text-white hover:bg-aqua/90"
                onClick={submitAssign}
                disabled={assignMu.isPending}
              >
                {assignMu.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Assign
              </Button>
            </div>
          )}
        </div>

        {/* Current mappings table */}
        <div>
          <div className="text-sm font-medium mb-2">Current Mappings</div>
          {accessQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (accessQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
              No parent-swimmer mappings yet.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto lp-scroll rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Parent</TableHead>
                    <TableHead>Swimmer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(accessQ.data ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.parentName ?? m.parentUserId}
                      </TableCell>
                      <TableCell>{m.swimmerName ?? m.swimmerId}</TableCell>
                      <TableCell>
                        {m.isActive ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-muted text-muted-foreground"
                          >
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => setRemoveTarget(m)}
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      {/* Remove confirm */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(b) => {
          if (!b) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove access for "{removeTarget?.parentName ?? "parent"}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke the parent&apos;s access to view{" "}
              <span className="font-semibold">
                {removeTarget?.swimmerName ?? "this swimmer"}
              </span>{" "}
              in the Parent Portal. The user account itself is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={removeMu.isPending || !removeTarget}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget) removeMu.mutate(removeTarget.id);
              }}
            >
              {removeMu.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================
// Main view
// ============================================================
export function AdminView() {
  const user = useAppStore((s) => s.user);

  if (!user || !canManageUsers(user.role) || !canDeleteEverything(user.role)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md border-red-500/30 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="size-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              This area is restricted to Super Admin users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your role is <span className="font-mono font-semibold">{user?.role ?? "none"}</span>.
              Contact a Super Admin if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-aqua/15 p-2">
          <Shield className="size-5 text-aqua" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Admin Maintenance</h1>
          <p className="text-xs text-muted-foreground">
            Database stats, audit log, danger zone and user management.
          </p>
        </div>
      </div>

      <StatsCard />
      <AuditCard />
      <DangerZoneCard />
      <UserManagementCard />
      <ParentAccessCard />

      <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-muted-foreground">
        <Activity className="size-3 text-aqua" />
        LanePulse Pro • Admin Console
      </div>
    </div>
  );
}
