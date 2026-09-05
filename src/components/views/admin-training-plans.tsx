"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { SwimmingStyleDTO, TrainingGroupDTO, TrainingPlanDTO, UserDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArrowDown, ArrowUp, ClipboardList, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type EditSet = { key: string; distanceMeters: number; repeatCount: number; swimmingStyleId: string; targetTimeSeconds: string; restIntervalSeconds: string; notes: string };
const blankSet = (styleId = ""): EditSet => ({ key: crypto.randomUUID(), distanceMeters: 50, repeatCount: 4, swimmingStyleId: styleId, targetTimeSeconds: "", restIntervalSeconds: "", notes: "" });

export function AdminTrainingPlans() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [coachId, setCoachId] = useState(""); const [status, setStatus] = useState("");
  const [styleId, setStyleId] = useState(""); const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [editTarget, setEditTarget] = useState<TrainingPlanDTO | null>(null);
  const [editName, setEditName] = useState(""); const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState(""); const [editRemarks, setEditRemarks] = useState("");
  const [editSets, setEditSets] = useState<EditSet[]>([]); const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrainingPlanDTO | null>(null); const [deleteText, setDeleteText] = useState("");

  const query = new URLSearchParams({ includeArchived: "true" });
  if (from) query.set("from", from); if (to) query.set("to", to); if (coachId) query.set("coachId", coachId);
  if (status) query.set("status", status); if (styleId) query.set("styleId", styleId); if (name) query.set("name", name);
  if (groupId) query.set("groupId", groupId);
  const plansQ = useQuery<TrainingPlanDTO[]>({ queryKey: ["admin", "training-plans", query.toString()], queryFn: () => api.get(`/api/training-plans?${query}`) });
  const usersQ = useQuery<UserDTO[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const stylesQ = useQuery<SwimmingStyleDTO[]>({ queryKey: ["styles"], queryFn: () => api.get("/api/styles") });
  const groupsQ = useQuery<TrainingGroupDTO[]>({ queryKey: ["groups", "active"], queryFn: () => api.get("/api/groups?active=true") });

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["admin", "training-plans"] }); await qc.invalidateQueries({ queryKey: ["admin", "audit"] }); };
  const openEdit = async (plan: TrainingPlanDTO) => {
    try {
      const detail = await api.get<TrainingPlanDTO>(`/api/training-plans/${plan.id}`);
      setEditTarget(detail); setEditName(detail.planName); setEditDate(detail.planDate.slice(0, 10));
      setEditStatus(detail.status); setEditRemarks(detail.remarks ?? "");
      setEditSets(detail.sets.map((set) => ({ key: crypto.randomUUID(), distanceMeters: set.distanceMeters, repeatCount: set.repeatCount,
        swimmingStyleId: set.swimmingStyleId, targetTimeSeconds: set.targetTimeSeconds?.toString() ?? "",
        restIntervalSeconds: set.restIntervalSeconds?.toString() ?? "", notes: set.notes ?? "" })));
    } catch (error: any) { toast.error(error.message); }
  };
  const updateSet = (key: string, patch: Partial<EditSet>) => setEditSets((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  const moveSet = (index: number, offset: number) => setEditSets((rows) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= rows.length) return rows; [next[index], next[target]] = [next[target], next[index]]; return next; });

  const saveEdit = async () => {
    if (!editTarget) return; setSaving(true);
    try {
      const result = await api.patch<{ warning?: string | null }>(`/api/training-plans/${editTarget.id}`, {
        planName: editName, planDate: new Date(`${editDate}T12:00:00Z`).toISOString(), status: editStatus, remarks: editRemarks,
        sets: editSets.map((set, index) => ({ sequenceNo: index + 1, distanceMeters: Number(set.distanceMeters), repeatCount: Number(set.repeatCount),
          swimmingStyleId: set.swimmingStyleId, targetTimeSeconds: set.targetTimeSeconds ? Number(set.targetTimeSeconds) : null,
          restIntervalSeconds: set.restIntervalSeconds ? Number(set.restIntervalSeconds) : null, notes: set.notes, isActive: true })),
      });
      toast.success("Training plan updated"); if (result.warning) toast.warning(result.warning); setEditTarget(null); await refresh();
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };
  const lifecycle = async (plan: TrainingPlanDTO, action: "ARCHIVE" | "RESTORE") => {
    try { await api.del(`/api/training-plans/${plan.id}`, { action }); toast.success(action === "ARCHIVE" ? "Plan archived" : "Plan restored"); await refresh(); }
    catch (error: any) { toast.error(error.message); }
  };
  const permanentDelete = async () => {
    if (!deleteTarget || deleteText !== "DELETE PLAN") return;
    try { await api.del(`/api/training-plans/${deleteTarget.id}`, { action: "PERMANENT", confirmation: deleteText }); toast.success("Unused plan permanently deleted"); setDeleteTarget(null); setDeleteText(""); await refresh(); }
    catch (error: any) { toast.error(error.message); }
  };

  return <Card className="border-aqua/25"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4 text-aqua" /> Training Plan Administration</CardTitle><CardDescription>Search, edit, archive, restore, or permanently remove unused plans.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      <Filter label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Filter>
      <Filter label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Filter>
      <Filter label="Coach"><select className="control" value={coachId} onChange={(e) => setCoachId(e.target.value)}><option value="">All coaches</option>{(usersQ.data ?? []).filter((user) => ["COACH", "SUPER_ADMIN"].includes(user.role)).map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></Filter>
      <Filter label="Status"><select className="control" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"].map((value) => <option key={value}>{value}</option>)}</select></Filter>
      <Filter label="Style"><select className="control" value={styleId} onChange={(e) => setStyleId(e.target.value)}><option value="">All styles</option>{(stylesQ.data ?? []).map((style) => <option key={style.id} value={style.id}>{style.styleName}</option>)}</select></Filter>
      <Filter label="Group"><select className="control" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">All groups</option>{(groupsQ.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.groupName}</option>)}</select></Filter>
      <Filter label="Plan Name"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Search plan name" /></div></Filter>
    </div>
    <div className="hidden lg:block overflow-x-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["Plan Date", "Plan Name", "Coach", "Sets", "Status", "Created", "Updated", "Actions"].map((head) => <th key={head} className="text-left p-2 whitespace-nowrap">{head}</th>)}</tr></thead><tbody>{(plansQ.data ?? []).map((plan) => <tr key={plan.id} className="border-t"><td className="p-2 whitespace-nowrap">{new Date(plan.planDate).toLocaleDateString()}</td><td className="p-2 font-medium max-w-64 truncate">{plan.planName}</td><td className="p-2">{plan.createdBy?.fullName ?? "—"}</td><td className="p-2">{plan.sets.length}</td><td className="p-2"><Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? plan.status : "ARCHIVED"}</Badge></td><td className="p-2 text-xs whitespace-nowrap">{new Date(plan.createdAt).toLocaleDateString()}</td><td className="p-2 text-xs whitespace-nowrap">{new Date(plan.updatedAt).toLocaleDateString()}</td><td className="p-2"><Actions plan={plan} edit={openEdit} lifecycle={lifecycle} remove={(value) => { setDeleteTarget(value); setDeleteText(""); }} /></td></tr>)}</tbody></table></div>
    <div className="lg:hidden space-y-2">{(plansQ.data ?? []).map((plan) => <div key={plan.id} className="border rounded-md p-3"><div className="flex justify-between gap-2"><span className="font-semibold break-words">{plan.planName}</span><Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? plan.status : "ARCHIVED"}</Badge></div><p className="text-xs text-muted-foreground mt-1">{new Date(plan.planDate).toLocaleDateString()} · {plan.createdBy?.fullName ?? "—"} · {plan.sets.length} sets</p><div className="mt-3"><Actions plan={plan} edit={openEdit} lifecycle={lifecycle} remove={(value) => { setDeleteTarget(value); setDeleteText(""); }} /></div></div>)}</div>

    <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Edit Training Plan</DialogTitle><DialogDescription>{(editTarget?.completedRunCount ?? 0) > 0 ? "This plan has completed practice history. Editing it may change the displayed plan definition. Consider duplicating it instead. Historical run snapshots remain unchanged." : "Update the plan definition and sets."}</DialogDescription></DialogHeader>
      <div className="grid sm:grid-cols-2 gap-2"><Filter label="Plan Name"><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></Filter><Filter label="Plan Date"><Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} /></Filter><Filter label="Status"><select className="control" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>{["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"].map((value) => <option key={value}>{value}</option>)}</select></Filter><Filter label="Remarks"><Input value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} /></Filter></div>
      <div className="space-y-2">{editSets.map((set, index) => <div key={set.key} className="border rounded-md p-3 space-y-2"><div className="flex justify-between"><Badge variant="secondary">Set {index + 1}</Badge><div><Button size="icon" variant="ghost" disabled={index === 0} onClick={() => moveSet(index, -1)}><ArrowUp /></Button><Button size="icon" variant="ghost" disabled={index === editSets.length - 1} onClick={() => moveSet(index, 1)}><ArrowDown /></Button><Button size="icon" variant="ghost" disabled={editSets.length === 1} onClick={() => setEditSets((rows) => rows.filter((row) => row.key !== set.key))}><Trash2 /></Button></div></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-2"><Filter label="Distance"><Input type="number" min={1} value={set.distanceMeters} onChange={(e) => updateSet(set.key, { distanceMeters: Number(e.target.value) })} /></Filter><Filter label="Repeats"><Input type="number" min={1} value={set.repeatCount} onChange={(e) => updateSet(set.key, { repeatCount: Number(e.target.value) })} /></Filter><Filter label="Style"><select className="control" value={set.swimmingStyleId} onChange={(e) => updateSet(set.key, { swimmingStyleId: e.target.value })}>{(stylesQ.data ?? []).map((style) => <option key={style.id} value={style.id}>{style.styleName}</option>)}</select></Filter><Filter label="Target"><Input type="number" value={set.targetTimeSeconds} onChange={(e) => updateSet(set.key, { targetTimeSeconds: e.target.value })} /></Filter><Filter label="Rest"><Input type="number" value={set.restIntervalSeconds} onChange={(e) => updateSet(set.key, { restIntervalSeconds: e.target.value })} /></Filter></div><Filter label="Notes"><Textarea rows={2} value={set.notes} onChange={(e) => updateSet(set.key, { notes: e.target.value })} /></Filter></div>)}</div>
      <Button variant="outline" onClick={() => setEditSets((rows) => [...rows, blankSet(stylesQ.data?.[0]?.id)])}><Plus /> Add Set</Button><DialogFooter><Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button><Button onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Permanently delete plan?</DialogTitle><DialogDescription>{(deleteTarget?._count?.runs ?? 0) > 0 ? "This plan has practice history and cannot be permanently deleted. Archive it instead." : "This removes the unused plan and its sets. Type DELETE PLAN to confirm."}</DialogDescription></DialogHeader><Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE PLAN" disabled={(deleteTarget?._count?.runs ?? 0) > 0} /><DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={deleteText !== "DELETE PLAN" || (deleteTarget?._count?.runs ?? 0) > 0} onClick={permanentDelete}><Trash2 /> Permanently Delete</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1 min-w-0"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>; }
function Actions({ plan, edit, lifecycle, remove }: { plan: TrainingPlanDTO; edit: (plan: TrainingPlanDTO) => void; lifecycle: (plan: TrainingPlanDTO, action: "ARCHIVE" | "RESTORE") => void; remove: (plan: TrainingPlanDTO) => void }) { return <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" className="h-10" onClick={() => edit(plan)}><Pencil /> Edit</Button>{plan.isActive ? <Button size="sm" variant="outline" className="h-10" onClick={() => lifecycle(plan, "ARCHIVE")}><Archive /> Archive</Button> : <Button size="sm" variant="outline" className="h-10" onClick={() => lifecycle(plan, "RESTORE")}><RotateCcw /> Restore</Button>}<Button size="sm" variant="destructive" className="h-10" onClick={() => remove(plan)}><Trash2 /> Delete</Button></div>; }
