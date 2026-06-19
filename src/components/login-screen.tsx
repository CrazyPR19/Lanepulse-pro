"use client";

// LanePulse Pro - login screen

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";

export function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Invalid username or password");
        return;
      }
      // Fetch the user profile
      const me = await fetch("/api/me").then((r) =>
        r.ok ? r.json() : null
      );
      if (me) {
        setUser(me);
        toast.success(`Welcome back, ${me.fullName}!`);
      }
    } catch (e: any) {
      toast.error(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0b1f3a] via-[#0e3a6b] to-[#1f9fbf] p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Logo size={64} className="lp-wave-anim" />
          <h1 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
            LanePulse <span className="text-[#7fdce6]">Pro</span>
          </h1>
          <p className="text-white/80 text-sm mt-1">
            Smart Swim Timing, Training & Performance Intelligence
          </p>
        </div>

        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="size-5 text-aqua" />
              Sign In
            </CardTitle>
            <CardDescription>
              Enter your credentials to access the coach console.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  autoCapitalize="none"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-aqua hover:bg-aqua/90 text-white h-11"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-white/60 mt-4 flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3" />
          Role-based access: Super Admin • Coach • Viewer
        </p>
      </div>
    </div>
  );
}
