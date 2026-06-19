"use client";

// LanePulse Pro — Groups / Heat Builder (12-lane pool)
// Task ID: 6 — Groups View
//
// Spec rules enforced by backend (we surface friendly errors):
//  - Same swimmer cannot be active twice in the same group.
//  - Same lane cannot have two active swimmers in the same group.
//  - Group changes affect future sessions only (historical sessions untouched).
//
// Layout:
//  - Top: group selector (Select) + "New Group" button + edit/bulk actions.
//  - Main: 12-lane board (responsive 2 / 3 / 4 cols).
//  - Side (or below on mobile): group details + Quick Transfer + Bulk Replace.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { POOL_LANES, canManageSwimmers } from "@/lib/helpers";
import type {
  TrainingGroupDTO,
  GroupMemberDTO,
  SwimmerDTO,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Search,
  UserPlus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Layers,
  Users,
  Waves,
  Save,
  UserCog,
} from "lucide-react";

type GroupDetailDTO = TrainingGroupDTO & { members: GroupMemberDTO[] };

// ============================================================
// MAIN VIEW
// ============================================================
export function GroupsView() {
  const user = useAppStore((s) => s.user);
  const canManage = canManageSwimmers(user?.role);
  const qc = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [pickerLane, setPickerLane] = useState<number | null>(null); // opens swimmer picker for this lane
  const [pickerReplace, setPickerReplace] = useState<{
    memberId: string;
    laneNo: number;
    currentName?: string;
  } | null>(null); // picker opened in "replace" mode
  const [removeTarget, setRemoveTarget] = useState<GroupMemberDTO | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupKey, setNewGroupKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);
  const [pickerKey, setPickerKey] = useState(0);

  // Bump-and-open helpers: each dialog is remounted fresh on each open
  // (via the `key` prop) so its internal form state initializes cleanly,
  // without needing setState-in-useEffect.
  const openNewGroup = () => {
    setNewGroupKey((k) => k + 1);
    setNewGroupOpen(true);
  };
  const openEdit = () => {
    setEditKey((k) => k + 1);
    setEditOpen(true);
  };
  const openBulk = () => {
    setBulkKey((k) => k + 1);
    setBulkOpen(true);
  };
  const openPickerForLane = (laneNo: number) => {
    setPickerKey((k) => k + 1);
    setPickerLane(laneNo);
  };
  const openPickerForReplace = (info: {
    memberId: string;
    laneNo: number;
    currentName?: string;
  }) => {
    setPickerKey((k) => k + 1);
    setPickerReplace(info);
  };

  // ---- queries ----
  const groupsQ = useQuery({
    queryKey: ["groups", "active"],
    queryFn: () => api.get<TrainingGroupDTO[]>("/api/groups?active=true"),
  });

  const swimmersQ = useQuery({
    queryKey: ["swimmers", "active"],
    queryFn: () => api.get<SwimmerDTO[]>("/api/swimmers?active=true"),
  });

  // Derive the effective selected group: explicit user choice OR first group.
  const effectiveSelectedGroupId =
    selectedGroupId ?? groupsQ.data?.[0]?.id ?? null;

  const groupQ = useQuery({
    queryKey: ["group", effectiveSelectedGroupId],
    queryFn: () =>
      api.get<GroupDetailDTO>(`/api/groups/${effectiveSelectedGroupId}`),
    enabled: !!effectiveSelectedGroupId,
  });

  // ---- lane board derived state ----
  const laneSlots = useMemo<(GroupMemberDTO | null)[]>(() => {
    const slots: (GroupMemberDTO | null)[] = Array.from(
      { length: 13 },
      () => null
    );
    if (groupQ.data?.members) {
      for (const m of groupQ.data.members) {
        if (m.laneNo >= 1 && m.laneNo <= 12) slots[m.laneNo] = m;
      }
    }
    return slots;
  }, [groupQ.data]);

  const memberCount = groupQ.data?.members?.length ?? 0;

  // ---- mutations ----
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["groups", "active"] });
    if (effectiveSelectedGroupId) {
      qc.invalidateQueries({ queryKey: ["group", effectiveSelectedGroupId] });
    }
  };

  const assignMut = useMutation({
    mutationFn: (vars: {
      groupId: string;
      swimmerId: string;
      laneNo: number;
    }) =>
      api.post<GroupMemberDTO>(`/api/groups/${vars.groupId}/members`, {
        swimmerId: vars.swimmerId,
        laneNo: vars.laneNo,
      }),
    onSuccess: () => {
      toast.success("Swimmer assigned to lane");
      invalidateAll();
      setPickerLane(null);
      setPickerReplace(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to assign swimmer";
      toast.error(msg);
    },
  });

  const removeMut = useMutation({
    mutationFn: (vars: { groupId: string; memberId: string }) =>
      api.del(`/api/groups/${vars.groupId}/members/${vars.memberId}`),
    onSuccess: () => {
      toast.success("Swimmer removed from lane");
      setRemoveTarget(null);
      invalidateAll();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to remove swimmer";
      toast.error(msg);
    },
  });

  const patchMemberMut = useMutation({
    mutationFn: (vars: {
      groupId: string;
      memberId: string;
      body: { laneNo?: number; swimmerId?: string; isActive?: boolean };
    }) =>
      api.patch<GroupMemberDTO>(
        `/api/groups/${vars.groupId}/members/${vars.memberId}`,
        vars.body
      ),
    onSuccess: () => {
      invalidateAll();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to update member";
      toast.error(msg);
    },
  });

  const bulkMut = useMutation({
    mutationFn: (vars: {
      groupId: string;
      members: { swimmerId: string; laneNo: number }[];
    }) =>
      api.put<GroupMemberDTO[]>(
        `/api/groups/${vars.groupId}/members`,
        { members: vars.members }
      ),
    onSuccess: () => {
      toast.success("Lane assignments saved");
      setBulkOpen(false);
      invalidateAll();
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error ? e.message : "Failed to bulk-update members";
      toast.error(msg);
    },
  });

  const createGroupMut = useMutation({
    mutationFn: (body: {
      groupName: string;
      groupLevel?: string | null;
      groupDate?: string | null;
      remarks?: string | null;
    }) => api.post<TrainingGroupDTO>("/api/groups", body),
    onSuccess: (g) => {
      toast.success(`Group "${g.groupName}" created`);
      setNewGroupOpen(false);
      qc.invalidateQueries({ queryKey: ["groups", "active"] });
      setSelectedGroupId(g.id);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to create group";
      toast.error(msg);
    },
  });

  const editGroupMut = useMutation({
    mutationFn: (vars: {
      id: string;
      body: {
        groupName?: string;
        groupLevel?: string | null;
        groupDate?: string | null;
        remarks?: string | null;
      };
    }) => api.patch<TrainingGroupDTO>(`/api/groups/${vars.id}`, vars.body),
    onSuccess: () => {
      toast.success("Group updated");
      setEditOpen(false);
      invalidateAll();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to update group";
      toast.error(msg);
    },
  });

  // ---- quick transfer: target group lookup ----
  const [qtSwimmerId, setQtSwimmerId] = useState<string>("");
  const [qtTargetGroupId, setQtTargetGroupId] = useState<string>("");
  const [qtTargetLane, setQtTargetLane] = useState<number>(1);
  const [qtReplaceOpen, setQtReplaceOpen] = useState(false);

  const qtSourceMember = useMemo(() => {
    if (!qtSwimmerId || !groupQ.data) return null;
    return (
      groupQ.data.members.find((m) => m.swimmerId === qtSwimmerId) ?? null
    );
  }, [qtSwimmerId, groupQ.data]);

  // Look up target group's members to detect lane conflicts
  const qtTargetQ = useQuery({
    queryKey: ["group", qtTargetGroupId],
    queryFn: () => api.get<GroupDetailDTO>(`/api/groups/${qtTargetGroupId}`),
    enabled: !!qtTargetGroupId,
  });

  const qtTargetOccupant = useMemo(() => {
    if (!qtTargetQ.data?.members) return null;
    return (
      qtTargetQ.data.members.find((m) => m.laneNo === qtTargetLane) ?? null
    );
  }, [qtTargetQ.data, qtTargetLane]);

  const handleQuickTransfer = () => {
    if (!effectiveSelectedGroupId || !qtSourceMember) return;
    if (!qtTargetGroupId) {
      toast.error("Select a target group");
      return;
    }
    if (qtSourceMember.swimmerId === qtTargetOccupant?.swimmerId) {
      toast.message("Swimmer is already in that lane");
      return;
    }

    // Cross-group transfer: POST to target (will deactivate existing membership
    // for this swimmer in the target group via backend), then DELETE from source.
    // Same-group lane change: PATCH the laneNo.
    const isSameGroup = qtTargetGroupId === effectiveSelectedGroupId;

    const doTransfer = async () => {
      try {
        if (isSameGroup) {
          // Same group → just PATCH laneNo on existing membership
          await patchMemberMut.mutateAsync({
            groupId: effectiveSelectedGroupId,
            memberId: qtSourceMember.id,
            body: { laneNo: qtTargetLane },
          });
          toast.success(
            `Moved ${qtSourceMember.swimmerName ?? "swimmer"} to lane ${qtTargetLane}`
          );
        } else {
          // Different group → POST new membership, then DELETE source
          await assignMut
            .mutateAsync({
              groupId: qtTargetGroupId,
              swimmerId: qtSourceMember.swimmerId,
              laneNo: qtTargetLane,
            })
            .catch(() => {
              throw new Error("assign-failed");
            });
          await api.del(`/api/groups/${effectiveSelectedGroupId}/members/${qtSourceMember.id}`);
          qc.invalidateQueries({ queryKey: ["group", qtTargetGroupId] });
          toast.success(
            `Transferred ${qtSourceMember.swimmerName ?? "swimmer"} to target group`
          );
        }
        // reset quick transfer form
        setQtSwimmerId("");
        setQtTargetGroupId("");
        setQtTargetLane(1);
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "assign-failed") {
          // assignMut already toasted the error
          return;
        }
        const msg =
          e instanceof Error ? e.message : "Failed to transfer swimmer";
        toast.error(msg);
      }
    };

    // If target lane is occupied (different swimmer), confirm replace
    if (qtTargetOccupant) {
      setQtReplaceOpen(true);
      return;
    }
    void doTransfer();
  };

  const confirmQtReplace = async () => {
    setQtReplaceOpen(false);
    if (!effectiveSelectedGroupId || !qtSourceMember || !qtTargetGroupId) return;
    try {
      // Remove the occupant first
      if (qtTargetOccupant) {
        await api.del(
          `/api/groups/${qtTargetGroupId}/members/${qtTargetOccupant.id}`
        );
        qc.invalidateQueries({ queryKey: ["group", qtTargetGroupId] });
      }
      const isSameGroup = qtTargetGroupId === effectiveSelectedGroupId;
      if (isSameGroup) {
        await patchMemberMut.mutateAsync({
          groupId: effectiveSelectedGroupId,
          memberId: qtSourceMember.id,
          body: { laneNo: qtTargetLane },
        });
        toast.success(
          `Moved ${qtSourceMember.swimmerName ?? "swimmer"} to lane ${qtTargetLane}`
        );
      } else {
        await api.post(`/api/groups/${qtTargetGroupId}/members`, {
          swimmerId: qtSourceMember.swimmerId,
          laneNo: qtTargetLane,
        });
        await api.del(
          `/api/groups/${effectiveSelectedGroupId}/members/${qtSourceMember.id}`
        );
        qc.invalidateQueries({ queryKey: ["group", qtTargetGroupId] });
        toast.success(
          `Transferred ${qtSourceMember.swimmerName ?? "swimmer"} to target group`
        );
      }
      setQtSwimmerId("");
      setQtTargetGroupId("");
      setQtTargetLane(1);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to replace and transfer";
      toast.error(msg);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="size-6 text-aqua" />
            Groups &amp; Heats
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build 12-lane training groups. Changes apply to future sessions
            only.
          </p>
        </div>
        {canManage && (
          <Button onClick={openNewGroup} className="gap-2">
            <Plus className="size-4" />
            New Group
          </Button>
        )}
      </div>

      {/* Group selector bar */}
      <Card className="bg-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Active Group
              </Label>
              <Select
                value={effectiveSelectedGroupId ?? ""}
                onValueChange={(v) => setSelectedGroupId(v)}
              >
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder="Select a group…" />
                </SelectTrigger>
                <SelectContent>
                  {groupsQ.data?.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-2">
                        <Waves className="size-3.5 text-aqua" />
                        <span className="font-medium">{g.groupName}</span>
                        {g.groupLevel && (
                          <span className="text-xs text-muted-foreground">
                            • {g.groupLevel}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className="ml-1 bg-aqua/15 text-aqua border-aqua/20"
                        >
                          {g.memberCount ?? 0} lanes
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                  {groupsQ.data?.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      No active groups yet.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            {canManage && effectiveSelectedGroupId && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={openEdit}
                  className="gap-2"
                >
                  <Pencil className="size-4" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={openBulk}
                  className="gap-2"
                >
                  <UserCog className="size-4" />
                  <span className="hidden sm:inline">Bulk Replace</span>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!effectiveSelectedGroupId ? (
        <EmptyState
          icon={<Layers className="size-10 text-aqua/60" />}
          title="No group selected"
          description="Pick an existing group above, or create a new one to start assigning swimmers to lanes."
        />
      ) : groupQ.isLoading ? (
        <div className="text-muted-foreground text-sm p-8 text-center">
          Loading lane board…
        </div>
      ) : !groupQ.data ? (
        <EmptyState
          icon={<Layers className="size-10 text-aqua/60" />}
          title="Group not found"
          description="This group may have been deactivated. Select another group."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* MAIN: Lane board */}
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Waves className="size-5 text-aqua" />
                    {groupQ.data.groupName}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    12-lane board • {memberCount} lane
                    {memberCount === 1 ? "" : "s"} assigned
                  </CardDescription>
                </div>
                <Badge
                  className="bg-navy text-white"
                  variant="default"
                >
                  {memberCount}/12
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {POOL_LANES.map((laneNo) => {
                  const member = laneSlots[laneNo];
                  return (
                    <LaneCard
                      key={laneNo}
                      laneNo={laneNo}
                      member={member}
                      canManage={canManage}
                      onAssign={() => openPickerForLane(laneNo)}
                      onReplace={() =>
                        member &&
                        openPickerForReplace({
                          memberId: member.id,
                          laneNo,
                          currentName: member.swimmerName,
                        })
                      }
                      onRemove={() => member && setRemoveTarget(member)}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* SIDE: Group details + Quick Transfer */}
          <div className="space-y-4">
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="size-4 text-aqua" />
                  Group Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Name" value={groupQ.data.groupName} />
                <DetailRow
                  label="Level"
                  value={groupQ.data.groupLevel ?? "—"}
                />
                <DetailRow
                  label="Date"
                  value={
                    groupQ.data.groupDate
                      ? new Date(groupQ.data.groupDate).toLocaleDateString()
                      : "—"
                  }
                />
                <DetailRow
                  label="Members"
                  value={`${memberCount} swimmer${memberCount === 1 ? "" : "s"}`}
                />
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    Remarks
                  </div>
                  <div className="text-sm min-h-[2.5rem] rounded-md bg-muted/40 p-2">
                    {groupQ.data.remarks || (
                      <span className="text-muted-foreground italic">
                        No remarks
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {canManage && (
              <Card className="bg-card border-aqua/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowRightLeft className="size-4 text-aqua" />
                    Quick Transfer
                  </CardTitle>
                  <CardDescription>
                    Move a swimmer from this group to another group or lane.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Swimmer (from this group)</Label>
                    <Select
                      value={qtSwimmerId}
                      onValueChange={setQtSwimmerId}
                    >
                      <SelectTrigger className="w-full mt-1 h-10">
                        <SelectValue placeholder="Select swimmer…" />
                      </SelectTrigger>
                      <SelectContent>
                        {groupQ.data.members
                          .slice()
                          .sort((a, b) =>
                            (a.swimmerName ?? "").localeCompare(
                              b.swimmerName ?? ""
                            )
                          )
                          .map((m) => (
                            <SelectItem key={m.id} value={m.swimmerId}>
                              {m.swimmerName ?? "Unknown"} • Lane {m.laneNo}
                            </SelectItem>
                          ))}
                        {groupQ.data.members.length === 0 && (
                          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                            No members in this group.
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {qtSourceMember && (
                    <div className="text-xs bg-muted/40 rounded-md p-2 text-muted-foreground">
                      Current:{" "}
                      <span className="font-medium text-foreground">
                        Lane {qtSourceMember.laneNo}
                      </span>{" "}
                      in this group
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Target Group</Label>
                    <Select
                      value={qtTargetGroupId}
                      onValueChange={setQtTargetGroupId}
                    >
                      <SelectTrigger className="w-full mt-1 h-10">
                        <SelectValue placeholder="Select target group…" />
                      </SelectTrigger>
                      <SelectContent>
                        {groupsQ.data?.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.groupName}
                            {g.id === effectiveSelectedGroupId && " (same group)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Target Lane</Label>
                    <Select
                      value={String(qtTargetLane)}
                      onValueChange={(v) => setQtTargetLane(Number(v))}
                    >
                      <SelectTrigger className="w-full mt-1 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POOL_LANES.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            Lane {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {qtTargetOccupant && (
                    <div className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-md p-2">
                      ⚠ Lane {qtTargetLane} is occupied by{" "}
                      <span className="font-medium">
                        {qtTargetOccupant.swimmerName ?? "another swimmer"}
                      </span>
                      . Replacing will remove them.
                    </div>
                  )}

                  <Button
                    className="w-full gap-2"
                    onClick={handleQuickTransfer}
                    disabled={
                      !canManage ||
                      !qtSourceMember ||
                      !qtTargetGroupId ||
                      patchMemberMut.isPending ||
                      assignMut.isPending
                    }
                  >
                    <ArrowRightLeft className="size-4" />
                    {qtTargetGroupId === effectiveSelectedGroupId
                      ? "Move to Lane"
                      : "Transfer Swimmer"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ---- Swimmer Picker Dialog (assign or replace) ---- */}
      <SwimmerPickerDialog
        key={`picker-${pickerKey}`}
        open={pickerLane !== null || pickerReplace !== null}
        laneNo={pickerLane ?? pickerReplace?.laneNo ?? 0}
        replaceMode={pickerReplace !== null}
        currentName={pickerReplace?.currentName}
        swimmers={swimmersQ.data ?? []}
        excludeSwimmerIds={(() => {
          // In replace mode: exclude all current members EXCEPT the one being
          // replaced (picking the same swimmer is a harmless no-op).
          // In assign mode: exclude all current members (no double-assignment).
          const ids: string[] = [];
          for (const m of groupQ.data?.members ?? []) {
            if (pickerReplace && m.id === pickerReplace.memberId) continue;
            ids.push(m.swimmerId);
          }
          return ids;
        })()}
        onPick={(swimmerId) => {
          if (!effectiveSelectedGroupId) return;
          const laneNo = pickerLane ?? pickerReplace?.laneNo;
          if (!laneNo) return;
          if (pickerReplace) {
            // PATCH existing membership to swap swimmer
            patchMemberMut.mutate({
              groupId: effectiveSelectedGroupId,
              memberId: pickerReplace.memberId,
              body: { swimmerId },
            });
          } else {
            assignMut.mutate({
              groupId: effectiveSelectedGroupId,
              swimmerId,
              laneNo,
            });
          }
        }}
        onOpenChange={(o) => {
          if (!o) {
            setPickerLane(null);
            setPickerReplace(null);
          }
        }}
      />

      {/* ---- New Group Dialog ---- */}
      <NewGroupDialog
        key={`new-${newGroupKey}`}
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        onSubmit={(body) => createGroupMut.mutate(body)}
        submitting={createGroupMut.isPending}
      />

      {/* ---- Edit Group Dialog ---- */}
      <EditGroupDialog
        key={`edit-${editKey}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        group={groupQ.data ?? null}
        onSubmit={(body) => {
          if (!effectiveSelectedGroupId) return;
          editGroupMut.mutate({ id: effectiveSelectedGroupId, body });
        }}
        submitting={editGroupMut.isPending}
      />

      {/* ---- Bulk Replace Dialog ---- */}
      <BulkReplaceDialog
        key={`bulk-${bulkKey}`}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        group={groupQ.data ?? null}
        swimmers={swimmersQ.data ?? []}
        onSubmit={(members) => {
          if (!effectiveSelectedGroupId) return;
          bulkMut.mutate({ groupId: effectiveSelectedGroupId, members });
        }}
        submitting={bulkMut.isPending}
      />

      {/* ---- Remove Confirm ---- */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove swimmer from lane?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">
                {removeTarget?.swimmerName ?? "this swimmer"}
              </span>{" "}
              from lane {removeTarget?.laneNo}. Historical sessions are not
              affected. Future sessions will use the updated lane assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={removeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!removeTarget || !effectiveSelectedGroupId) return;
                removeMut.mutate({
                  groupId: effectiveSelectedGroupId,
                  memberId: removeTarget.id,
                });
              }}
            >
              {removeMut.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- Quick Transfer Replace Confirm ---- */}
      <AlertDialog
        open={qtReplaceOpen}
        onOpenChange={setQtReplaceOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace occupant in target lane?</AlertDialogTitle>
            <AlertDialogDescription>
              Lane {qtTargetLane} in the target group is occupied by{" "}
              <span className="font-medium text-foreground">
                {qtTargetOccupant?.swimmerName ?? "another swimmer"}
              </span>
              . They will be removed from that lane, and{" "}
              <span className="font-medium text-foreground">
                {qtSourceMember?.swimmerName ?? "the selected swimmer"}
              </span>{" "}
              will take their place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-aqua text-white hover:bg-aqua/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmQtReplace();
              }}
            >
              Replace &amp; Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// LANE CARD
// ============================================================
function LaneCard({
  laneNo,
  member,
  canManage,
  onAssign,
  onReplace,
  onRemove,
}: {
  laneNo: number;
  member: GroupMemberDTO | null;
  canManage: boolean;
  onAssign: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const occupied = !!member;
  return (
    <div
      className={cn(
        "relative rounded-lg border p-2.5 flex flex-col gap-1.5 min-h-[120px] transition-colors",
        occupied
          ? "border-aqua/40 bg-aqua/5"
          : "border-dashed border-border bg-muted/20"
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-navy leading-none tabular-nums">
          {laneNo}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Lane
        </span>
      </div>

      <div className="flex-1 flex items-center">
        {occupied ? (
          <div className="text-sm font-medium leading-tight line-clamp-2 break-words">
            {member?.swimmerName ?? "Unknown"}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">Empty</div>
        )}
      </div>

      {canManage && (
        <div className="flex gap-1 mt-auto">
          {occupied ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs gap-1"
                onClick={onReplace}
              >
                <UserCog className="size-3" />
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onRemove}
                aria-label={`Remove swimmer from lane ${laneNo}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1 border-aqua/40 text-aqua hover:bg-aqua/10"
              onClick={onAssign}
            >
              <UserPlus className="size-3" />
              Assign
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SWIMMER PICKER DIALOG
// ============================================================
function SwimmerPickerDialog({
  open,
  laneNo,
  replaceMode,
  currentName,
  swimmers,
  excludeSwimmerIds,
  onPick,
  onOpenChange,
}: {
  open: boolean;
  laneNo: number;
  replaceMode: boolean;
  currentName?: string;
  swimmers: SwimmerDTO[];
  excludeSwimmerIds: string[];
  onPick: (swimmerId: string) => void;
  onOpenChange: (o: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const excludeSet = useMemo(
    () => new Set(excludeSwimmerIds),
    [excludeSwimmerIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return swimmers
      .filter((s) => !excludeSet.has(s.id))
      .filter((s) => !q || s.swimmerName.toLowerCase().includes(q))
      .slice(0, 60);
  }, [swimmers, excludeSet, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {replaceMode ? "Replace Swimmer" : "Assign Swimmer"} — Lane{" "}
            {laneNo}
          </DialogTitle>
          <DialogDescription>
            {replaceMode
              ? `Choose a swimmer to replace ${currentName ?? "current"} in lane ${laneNo}.`
              : `Choose an active swimmer to assign to lane ${laneNo}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search swimmers…"
            className="pl-9 h-10"
            autoFocus
          />
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              {swimmers.length === 0
                ? "No active swimmers available."
                : "No swimmers match your search."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-aqua/10 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {s.swimmerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.gender ? `${s.gender} • ` : ""}
                        {s.age !== null ? `${s.age} yrs` : "Age unknown"}
                      </div>
                    </div>
                    <UserPlus className="size-4 text-aqua shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// NEW GROUP DIALOG
// ============================================================
function NewGroupDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (body: {
    groupName: string;
    groupLevel: string | null;
    groupDate: string | null;
    remarks: string | null;
  }) => void;
  submitting: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [groupLevel, setGroupLevel] = useState("");
  const [groupDate, setGroupDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const handleSubmit = () => {
    if (!groupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    onSubmit({
      groupName: groupName.trim(),
      groupLevel: groupLevel.trim() || null,
      groupDate: groupDate ? new Date(groupDate).toISOString() : null,
      remarks: remarks.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Training Group</DialogTitle>
          <DialogDescription>
            Create a new group. You can assign swimmers to lanes after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ng-name">Group Name *</Label>
            <Input
              id="ng-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Heat A — Senior Boys"
              className="mt-1 h-10"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="ng-level">Level</Label>
            <Input
              id="ng-level"
              value={groupLevel}
              onChange={(e) => setGroupLevel(e.target.value)}
              placeholder="e.g. Advanced, Intermediate"
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="ng-date">Date</Label>
            <Input
              id="ng-date"
              type="date"
              value={groupDate}
              onChange={(e) => setGroupDate(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="ng-remarks">Remarks</Label>
            <Textarea
              id="ng-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes for this group…"
              className="mt-1 min-h-[60px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            <Save className="size-4" />
            {submitting ? "Creating…" : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// EDIT GROUP DIALOG
// ============================================================
function EditGroupDialog({
  open,
  onOpenChange,
  group,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: GroupDetailDTO | null;
  onSubmit: (body: {
    groupName: string;
    groupLevel: string | null;
    groupDate: string | null;
    remarks: string | null;
  }) => void;
  submitting: boolean;
}) {
  // Lazy-initialize from the group prop. The parent remounts this dialog
  // (via `key`) on each open, so this runs fresh each time.
  const [groupName, setGroupName] = useState(group?.groupName ?? "");
  const [groupLevel, setGroupLevel] = useState(group?.groupLevel ?? "");
  const [groupDate, setGroupDate] = useState(
    group?.groupDate ? new Date(group.groupDate).toISOString().slice(0, 10) : ""
  );
  const [remarks, setRemarks] = useState(group?.remarks ?? "");

  const handleSubmit = () => {
    if (!groupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    onSubmit({
      groupName: groupName.trim(),
      groupLevel: groupLevel.trim() || null,
      groupDate: groupDate ? new Date(groupDate).toISOString() : null,
      remarks: remarks.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>
            Update group details. Lane assignments are not affected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="eg-name">Group Name *</Label>
            <Input
              id="eg-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="eg-level">Level</Label>
            <Input
              id="eg-level"
              value={groupLevel}
              onChange={(e) => setGroupLevel(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="eg-date">Date</Label>
            <Input
              id="eg-date"
              type="date"
              value={groupDate}
              onChange={(e) => setGroupDate(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="eg-remarks">Remarks</Label>
            <Textarea
              id="eg-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="mt-1 min-h-[60px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            <Save className="size-4" />
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// BULK REPLACE DIALOG
// ============================================================
function BulkReplaceDialog({
  open,
  onOpenChange,
  group,
  swimmers,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: GroupDetailDTO | null;
  swimmers: SwimmerDTO[];
  onSubmit: (members: { swimmerId: string; laneNo: number }[]) => void;
  submitting: boolean;
}) {
  // Lazy-initialize from the current group members. Parent remounts this
  // dialog (via `key`) on each open, so assignments start fresh each time.
  const [assignments, setAssignments] = useState<Record<number, string>>(
    () => {
      const next: Record<number, string> = {};
      for (const n of POOL_LANES) next[n] = "";
      if (group) {
        for (const m of group.members) {
          if (m.laneNo >= 1 && m.laneNo <= 12) next[m.laneNo] = m.swimmerId;
        }
      }
      return next;
    }
  );

  const handleSubmit = () => {
    const members: { swimmerId: string; laneNo: number }[] = [];
    for (const n of POOL_LANES) {
      const sid = assignments[n];
      if (sid) members.push({ swimmerId: sid, laneNo: n });
    }
    if (members.length === 0) {
      toast.error("Assign at least one swimmer to a lane");
      return;
    }
    // Check for duplicate swimmers (UI safety; backend also validates)
    const ids = new Set<string>();
    for (const m of members) {
      if (ids.has(m.swimmerId)) {
        toast.error("A swimmer appears in more than one lane");
        return;
      }
      ids.add(m.swimmerId);
    }
    onSubmit(members);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Replace Members</DialogTitle>
          <DialogDescription>
            Assign swimmers to all 12 lanes at once. This will replace the
            current lane assignments for{" "}
            <span className="font-medium text-foreground">
              {group?.groupName}
            </span>
            . Historical sessions are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto lp-scroll pr-1">
          {POOL_LANES.map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span className="w-14 text-sm font-semibold text-navy tabular-nums">
                Lane {n}
              </span>
              <Select
                value={assignments[n] ?? ""}
                onValueChange={(v) =>
                  setAssignments((a) => ({ ...a, [n]: v === "__none" ? "" : v }))
                }
              >
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="— Empty —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Empty —</SelectItem>
                  {swimmers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.swimmerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            <Save className="size-4" />
            {submitting ? "Saving…" : "Replace All Members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// HELPERS
// ============================================================
function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-medium text-right break-words">
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="bg-card border-dashed">
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        <div className="rounded-full bg-aqua/10 p-4">{icon}</div>
        <div>
          <div className="font-semibold text-lg">{title}</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-md">
            {description}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
