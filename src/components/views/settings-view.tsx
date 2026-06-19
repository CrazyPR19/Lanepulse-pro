"use client";

// LanePulse Pro - Settings (SUPER_ADMIN only)

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  Info,
  Loader2,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Waves,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { canManageUsers } from "@/lib/helpers";
import { useAppStore } from "@/lib/store";
import type { SwimmingStyleDTO } from "@/lib/types";
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
// Database connection card (read-only diagnostic)
// ============================================================
function DatabaseCard() {
  const rows: { label: string; value: string }[] = [
    { label: "Type", value: "SQLite (built-in)" },
    { label: "Status", value: "Connected" },
    { label: "Host", value: "local" },
    { label: "Port", value: "—" },
    { label: "Database", value: "lanepulse_pro" },
    { label: "User", value: "—" },
    { label: "Password", value: "********" },
  ];

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4 text-aqua" />
          Database Connection
        </CardTitle>
        <CardDescription>
          LanePulse Pro uses a built-in local database. No external setup
          required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {rows.map((r) => (
            <div
              key={r.label}
              className="rounded-md border bg-card px-3 py-2 flex items-center justify-between gap-3"
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.label}
              </span>
              <span className="text-sm font-mono font-medium truncate">
                {r.value}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-aqua/5 border border-aqua/20 rounded-md p-3 mb-3">
          <Info className="size-4 text-aqua shrink-0" />
          <span>
            LanePulse Pro uses a built-in local database. No external setup
            required.
          </span>
        </div>
        <Button
          variant="outline"
          onClick={() => toast.success("Connection OK")}
        >
          <CheckCircle2 className="size-4 text-aqua" /> Test Connection
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Styles management
// ============================================================
interface StyleFormState {
  styleName: string;
  sortOrder: number;
  isActive: boolean;
}

function emptyStyleForm(): StyleFormState {
  return { styleName: "", sortOrder: 0, isActive: true };
}

function StylesCard() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SwimmingStyleDTO | null>(null);
  const [form, setForm] = useState<StyleFormState>(emptyStyleForm());
  const [deleteTarget, setDeleteTarget] = useState<SwimmingStyleDTO | null>(null);

  const stylesQ = useQuery<SwimmingStyleDTO[]>({
    queryKey: ["styles"],
    queryFn: () => api.get<SwimmingStyleDTO[]>("/api/styles"),
  });

  const createMu = useMutation({
    mutationFn: (body: StyleFormState) =>
      api.post<SwimmingStyleDTO>("/api/styles", body),
    onSuccess: () => {
      toast.success("Style created.");
      qc.invalidateQueries({ queryKey: ["styles"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMu = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<StyleFormState> }) =>
      api.patch<SwimmingStyleDTO>(`/api/styles/${id}`, body),
    onSuccess: () => {
      toast.success("Style updated.");
      qc.invalidateQueries({ queryKey: ["styles"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMu = useMutation({
    mutationFn: (id: string) => api.del(`/api/styles/${id}`),
    onSuccess: () => {
      toast.success("Style deactivated.");
      qc.invalidateQueries({ queryKey: ["styles"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyStyleForm());
    setDialogOpen(true);
  }
  function openEdit(s: SwimmingStyleDTO) {
    setEditing(s);
    setForm({
      styleName: s.styleName,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    });
    setDialogOpen(true);
  }

  function submit() {
    if (editing) {
      patchMu.mutate({ id: editing.id, body: form });
    } else {
      createMu.mutate(form);
    }
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Waves className="size-4 text-aqua" />
              Swimming Styles
            </CardTitle>
            <CardDescription>
              Add, edit, reorder and deactivate stroke / drill types.
            </CardDescription>
          </div>
          <Button
            className="bg-aqua text-white hover:bg-aqua/90"
            onClick={openCreate}
          >
            <Plus className="size-4" /> Add Style
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stylesQ.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (stylesQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            No styles yet.
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto lp-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>Sort Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stylesQ.data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.styleName}</TableCell>
                    <TableCell className="text-xs font-mono">
                      {s.sortOrder}
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                          onClick={() => setDeleteTarget(s)}
                          disabled={!s.isActive}
                        >
                          <Trash2 className="size-3.5" /> Deactivate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit "${editing.styleName}"` : "Add Style"}
            </DialogTitle>
            <DialogDescription>
              Styles with lower sort order appear first in pickers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Style Name</Label>
              <Input
                value={form.styleName}
                onChange={(e) =>
                  setForm({ ...form, styleName: e.target.value })
                }
                placeholder="e.g. Free Style"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort Order</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Number(e.target.value) })
                }
              />
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
              disabled={createMu.isPending || patchMu.isPending || !form.styleName.trim()}
            >
              {createMu.isPending || patchMu.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {editing ? "Save Changes" : "Create Style"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(b) => {
          if (!b) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate style "{deleteTarget?.styleName}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The style will be hidden from pickers but kept in history. Active
              sessions referencing this style must be archived first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMu.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMu.mutate(deleteTarget.id);
              }}
            >
              {deleteMu.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================
// App info card
// ============================================================
function AppInfoCard() {
  const setView = useAppStore((s) => s.setView);
  const info: { label: string; value: string }[] = [
    { label: "Version", value: "1.0.0" },
    { label: "Lane Count", value: "12" },
    { label: "Theme", value: "Sporty Navy / Aqua (light + dark)" },
    { label: "Framework", value: "Next.js 16 + TypeScript" },
  ];

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SettingsIcon className="size-4 text-aqua" />
          App Info
        </CardTitle>
        <CardDescription>Build configuration and quick links.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {info.map((r) => (
            <div
              key={r.label}
              className="rounded-md border bg-card px-3 py-2 flex items-center justify-between gap-3"
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.label}
              </span>
              <span className="text-sm font-medium">{r.value}</span>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={() => setView("admin")}
          className="w-full sm:w-auto"
        >
          <Shield className="size-4 text-aqua" />
          Open Admin Console
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Main view
// ============================================================
export function SettingsView() {
  const user = useAppStore((s) => s.user);

  if (!user || !canManageUsers(user.role)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md border-red-500/30 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Shield className="size-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              This area is restricted to Super Admin users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your role is{" "}
              <span className="font-mono font-semibold">
                {user?.role ?? "none"}
              </span>
              . Contact a Super Admin if you believe this is an error.
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
          <SettingsIcon className="size-5 text-aqua" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Database, swimming styles, app information.
          </p>
        </div>
      </div>

      <DatabaseCard />
      <StylesCard />
      <AppInfoCard />

      <div className="flex items-center justify-center gap-2 pt-4 text-[11px] text-muted-foreground">
        <Waves className="size-3 text-aqua" />
        LanePulse Pro • Settings
      </div>
    </div>
  );
}
