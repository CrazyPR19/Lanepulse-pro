"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronRight, Waves } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AcademyOnboardingData = { academyName: string; country: string | null; city: string | null; timezone: string; logoUrl: string | null; settings: { defaultLaneCount: number; poolLengthMeters: number; onboardingStep: number } | null };

const steps = ["Academy profile", "Pool configuration", "Create first coach", "Add swimmers", "Create first group", "Launch dashboard"];

export function AcademyOnboarding({ academy }: { academy: AcademyOnboardingData }) {
  const queryClient = useQueryClient();
  const setView = useAppStore((state) => state.setView);
  const [step, setStep] = useState(academy.settings?.onboardingStep ?? 1);
  const [form, setForm] = useState({ academyName: academy.academyName, country: academy.country ?? "", city: academy.city ?? "", timezone: academy.timezone, logoUrl: academy.logoUrl ?? "", defaultLaneCount: academy.settings?.defaultLaneCount ?? 8, poolLengthMeters: academy.settings?.poolLengthMeters ?? 25 });
  useEffect(() => setStep(academy.settings?.onboardingStep ?? 1), [academy.settings?.onboardingStep]);
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch("/api/academy/settings", body), onError: (error: Error) => toast.error(error.message) });
  async function next() {
    const nextStep = Math.min(6, step + 1);
    await save.mutateAsync({ ...form, onboardingStep: nextStep });
    setStep(nextStep);
    queryClient.invalidateQueries({ queryKey: ["academy", "settings"] });
  }
  async function finish() {
    await save.mutateAsync({ ...form, onboardingStep: 6, onboardingCompleted: true });
    await queryClient.invalidateQueries({ queryKey: ["academy", "settings"] });
    setView("dashboard");
    toast.success("Academy setup complete.");
  }
  return (
    <div className="min-h-screen bg-background p-3 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-3xl space-y-4">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><Waves className="size-6 text-aqua" /> Set up {academy.academyName}</h1><p className="text-sm text-muted-foreground">Step {step} of 6 · Powered by LanePulse Pro</p></div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">{steps.map((label, index) => <div key={label} className="min-w-0"><div className={`h-1.5 rounded ${index + 1 <= step ? "bg-aqua" : "bg-muted"}`} /><p className="hidden sm:block mt-1 text-[10px] text-muted-foreground truncate">{label}</p></div>)}</div>
        <Card>
          <CardHeader><CardTitle className="text-lg">{steps[step - 1]}</CardTitle><CardDescription>{step === 1 ? "Confirm the public academy identity." : step === 2 ? "Configure the pool used by timing consoles." : "This checklist keeps the first operational setup in a safe order."}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="sm:col-span-2 space-y-1"><Label>Academy Name</Label><Input value={form.academyName} onChange={(event) => setForm({ ...form, academyName: event.target.value })} /></div><div className="space-y-1"><Label>Country</Label><Input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></div><div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div><div className="space-y-1"><Label>Timezone</Label><Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></div><div className="space-y-1"><Label>Logo URL</Label><Input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} /></div></div>}
            {step === 2 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="space-y-1"><Label>Lane Count</Label><Select value={String(form.defaultLaneCount)} onValueChange={(value) => setForm({ ...form, defaultLaneCount: Number(value) })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent>{[4,6,8,10,12].map((value) => <SelectItem key={value} value={String(value)}>{value} lanes</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Pool Length</Label><Select value={String(form.poolLengthMeters)} onValueChange={(value) => setForm({ ...form, poolLengthMeters: Number(value) })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25 meters</SelectItem><SelectItem value="50">50 meters</SelectItem></SelectContent></Select></div></div>}
            {step >= 3 && step <= 5 && <div className="rounded-md border p-4 flex items-start gap-3"><Building2 className="size-5 text-aqua shrink-0" /><div><p className="font-medium">{step === 3 ? "Create a Coach account in Admin after setup." : step === 4 ? "Add swimmers individually or use the Swimmer workspace." : "Create a group and assign swimmers to configured lanes."}</p><p className="text-sm text-muted-foreground mt-1">Tenant isolation is already active; records created there belong only to this academy.</p></div></div>}
            {step === 6 && <div className="rounded-md border border-aqua/30 bg-aqua/5 p-5 text-center"><Check className="size-8 text-aqua mx-auto" /><p className="font-semibold mt-2">Your academy workspace is ready.</p><p className="text-sm text-muted-foreground">Continue to the dashboard, then add coaches, swimmers and groups from their full management screens.</p></div>}
            <div className="flex justify-end"><Button className="h-11 bg-aqua text-white hover:bg-aqua/90" disabled={save.isPending} onClick={step === 6 ? finish : next}>{step === 6 ? "Launch Dashboard" : "Save and Continue"}<ChevronRight className="size-4" /></Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
