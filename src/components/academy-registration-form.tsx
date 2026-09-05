"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";

export function AcademyRegistrationForm({ onBack }: { onBack: () => void }) {
  const setUser = useAppStore((state) => state.setUser);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    academyName: "", academyCode: "", country: "", city: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ownerFullName: "", ownerEmail: "", phone: "", password: "", confirmPassword: "",
  });

  function field(name: keyof typeof form) {
    return { value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: event.target.value }) };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/academies/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Registration failed.");
      const login = await signIn("credentials", { username: form.ownerEmail, password: form.password, redirect: false });
      if (login?.error) throw new Error("Academy created. Sign in with the owner email to continue.");
      const me = await fetch("/api/me").then((res) => res.ok ? res.json() : null);
      if (me) setUser(me);
      toast.success("Academy created. Welcome to LanePulse Pro.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2"><Label>Academy Name</Label><Input {...field("academyName")} required /></div>
        <div className="space-y-1.5"><Label>Academy Code</Label><Input {...field("academyCode")} placeholder="Auto-generated if blank" /></div>
        <div className="space-y-1.5"><Label>Timezone</Label><Input {...field("timezone")} required /></div>
        <div className="space-y-1.5"><Label>Country</Label><Input {...field("country")} /></div>
        <div className="space-y-1.5"><Label>City</Label><Input {...field("city")} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Owner Full Name</Label><Input {...field("ownerFullName")} required /></div>
        <div className="space-y-1.5"><Label>Owner Email</Label><Input type="email" {...field("ownerEmail")} required /></div>
        <div className="space-y-1.5"><Label>Phone (optional)</Label><Input {...field("phone")} /></div>
        <div className="space-y-1.5"><Label>Password</Label><Input type="password" {...field("password")} minLength={8} required /></div>
        <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" {...field("confirmPassword")} minLength={8} required /></div>
      </div>
      <Button className="w-full h-11 bg-aqua text-white hover:bg-aqua/90" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />} Create Your Academy
      </Button>
      <Button type="button" variant="ghost" className="w-full h-11" onClick={onBack}>Back to sign in</Button>
    </form>
  );
}
