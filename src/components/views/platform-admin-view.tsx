"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PlatformData = {
  totals: Record<string, number>;
  academies: Array<{ id: string; academyName: string; academyCode: string; city: string | null; country: string | null; subscriptionPlan: string; isActive: boolean; createdAt: string; _count: { users: number; swimmers: number; trainingSessions: number; practiceRuns: number } }>;
};

export function PlatformAdminView() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const data = useQuery<PlatformData>({ queryKey: ["platform", "academies", search], queryFn: () => api.get(`/api/platform/academies?search=${encodeURIComponent(search)}`) });
  const status = useMutation({
    mutationFn: ({ academyId, isActive }: { academyId: string; isActive: boolean }) => api.patch("/api/platform/academies", { academyId, isActive }),
    onSuccess: () => { toast.success("Academy status updated."); queryClient.invalidateQueries({ queryKey: ["platform", "academies"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const labels: Record<string, string> = { academies: "Academies", activeAcademies: "Active", users: "Users", swimmers: "Swimmers", sessions: "Sessions", practiceRuns: "Practice Runs" };
  return (
    <div className="space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="size-5 text-aqua" /> Platform Administration</h1><p className="text-xs text-muted-foreground">Aggregate usage and academy status. Swimmer personal details are not shown.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">{Object.entries(data.data?.totals ?? {}).map(([key, value]) => <Card key={key}><CardContent className="p-3"><p className="text-xs text-muted-foreground break-words">{labels[key] ?? key}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9 h-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search academy or code" /></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{(data.data?.academies ?? []).map((academy) => <Card key={academy.id}><CardHeader className="pb-2"><CardTitle className="text-base flex items-start justify-between gap-2"><span className="flex items-center gap-2 min-w-0"><Building2 className="size-4 text-aqua shrink-0" /><span className="truncate">{academy.academyName}</span></span><Badge variant={academy.isActive ? "default" : "secondary"}>{academy.isActive ? "Active" : "Inactive"}</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{academy.academyCode} · {academy.city || academy.country || "Location not set"} · {academy.subscriptionPlan}</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm"><span>{academy._count.users} users</span><span>{academy._count.swimmers} swimmers</span><span>{academy._count.trainingSessions} sessions</span><span>{academy._count.practiceRuns} runs</span></div><Button variant="outline" className="h-11" disabled={status.isPending} onClick={() => status.mutate({ academyId: academy.id, isActive: !academy.isActive })}>{academy.isActive ? "Deactivate" : "Activate"}</Button></CardContent></Card>)}</div>
    </div>
  );
}
