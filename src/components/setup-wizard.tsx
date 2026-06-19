"use client";

// LanePulse Pro - first-run setup wizard

import { useState } from "react";
import { signIn } from "next-auth/react";
import { api } from "@/lib/api-client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Database, ShieldCheck, Waves, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";

export function SetupWizard() {
  const setHasSetup = useAppStore((s) => s.setHasSetup);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    confirm: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/setup", {
        fullName: form.fullName,
        email: form.email,
        username: form.username,
        password: form.password,
      });
      toast.success("Super Admin created! Signing you in...");
      // Auto sign-in
      const res = await signIn("credentials", {
        username: form.username,
        password: form.password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Account created. Please log in.");
        setHasSetup(true);
      } else {
        setHasSetup(true);
      }
    } catch (e: any) {
      toast.error(e.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b1f3a] via-[#0e3a6b] to-[#1f9fbf] p-4">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-6">
          <Logo size={72} className="lp-wave-anim" />
          <h1 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
            LanePulse <span className="text-[#7fdce6]">Pro</span>
          </h1>
          <p className="text-white/80 text-sm mt-1">
            Smart Swim Timing, Training & Performance Intelligence
          </p>
        </div>

        <Card className="shadow-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-aqua" />
                First-Run Setup Wizard
              </CardTitle>
              <Badge variant="secondary">Step {step} of 3</Badge>
            </div>
            <CardDescription>
              Let's get your swim training system ready. This wizard only runs once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Progress */}
            <div className="flex items-center gap-2 mb-6">
              {[
                { n: 1, label: "Database", icon: Database },
                { n: 2, label: "Admin User", icon: ShieldCheck },
                { n: 3, label: "Launch", icon: Waves },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      step >= s.n
                        ? "bg-aqua text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <s.icon className="size-3.5" />
                    {s.label}
                  </div>
                  {i < 2 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        step > s.n ? "bg-aqua" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-aqua/30 bg-aqua/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="size-4 text-aqua" />
                    <span className="font-semibold text-sm">
                      Database Connection
                    </span>
                    <Badge className="ml-auto bg-green-500 hover:bg-green-500 text-white">
                      <CheckCircle2 className="size-3 mr-1" /> Connected
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="text-foreground/70">Type:</span> SQLite (built-in)
                    </div>
                    <div>
                      <span className="text-foreground/70">Status:</span> Healthy
                    </div>
                    <div>
                      <span className="text-foreground/70">Migrations:</span> Applied
                    </div>
                    <div>
                      <span className="text-foreground/70">Password:</span> ********
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  LanePulse Pro ships with a built-in database that's ready to go.
                  No external database setup needed. Your data is stored locally and
                  securely.
                </p>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} className="bg-navy hover:bg-navy/90">
                    Continue <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create your <strong>Super Admin</strong> account. This user has full
                  access and can create other coaches/viewers later.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      placeholder="Coach Smith"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="coach@club.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={form.username}
                      onChange={(e) => set("username", e.target.value)}
                      placeholder="admin"
                      autoCapitalize="none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="Min 6 characters"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="confirm">Confirm Password</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={form.confirm}
                      onChange={(e) => set("confirm", e.target.value)}
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={
                      !form.fullName ||
                      !form.email ||
                      !form.username ||
                      !form.password ||
                      !form.confirm
                    }
                    className="bg-navy hover:bg-navy/90"
                  >
                    Continue <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-aqua/30 bg-aqua/5 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-green-500" />
                    <span className="text-sm font-medium">
                      Default swimming styles will be initialized
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Free Style",
                      "Back Stroke",
                      "Breast Stroke",
                      "Butterfly",
                      "Individual Medley",
                      "Freestyle Relay",
                      "Medley Relay",
                      "Kickboard Drill",
                      "Pull Buoy Drill",
                      "Sprint Training",
                      "Endurance Training",
                    ].map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-aqua/30 bg-aqua/5 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="size-4 text-aqua" />
                    <span className="text-sm font-medium">
                      Ready to launch
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin: <strong>{form.username}</strong> ({form.email})
                  </p>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  <Button
                    onClick={submit}
                    disabled={busy}
                    className="bg-aqua hover:bg-aqua/90 text-white"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Waves className="size-4" />
                    )}
                    Launch LanePulse Pro
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-white/60 mt-4">
          Once the first admin is created, this setup page will be permanently disabled.
        </p>
      </div>
    </div>
  );
}
