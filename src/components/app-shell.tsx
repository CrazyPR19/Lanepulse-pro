"use client";

// LanePulse Pro - app shell (sidebar + mobile bottom nav + header + content)

import { useAppStore, type ViewKey } from "@/lib/store";
import { LogoLockup } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Timer,
  Users,
  Grid3x3,
  History,
  BarChart3,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  Waves,
  HeartHandshake,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: ("SUPER_ADMIN" | "COACH" | "VIEWER" | "PARENT")[];
  mobileLabel?: string; // shorter label for bottom nav
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "COACH", "VIEWER"] },
  { key: "timer", label: "Timing Console", icon: Timer, roles: ["SUPER_ADMIN", "COACH"], mobileLabel: "Timing" },
  { key: "swimmers", label: "Swimmers", icon: Users, roles: ["SUPER_ADMIN", "COACH"] },
  { key: "groups", label: "Groups / Heats", icon: Grid3x3, roles: ["SUPER_ADMIN", "COACH"], mobileLabel: "Groups" },
  { key: "history", label: "Session History", icon: History, roles: ["SUPER_ADMIN", "COACH", "VIEWER"], mobileLabel: "History" },
  { key: "analysis", label: "Analysis", icon: BarChart3, roles: ["SUPER_ADMIN", "COACH", "VIEWER"] },
  { key: "parent", label: "My Child", icon: HeartHandshake, roles: ["PARENT"] },
  { key: "admin", label: "Admin", icon: Shield, roles: ["SUPER_ADMIN"] },
  { key: "settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, user, sidebarOpen, setSidebarOpen } = useAppStore();

  const role = user?.role;
  const items = NAV.filter((n) => n.roles.some((r) => r === role));
  const current = items.find((n) => n.key === view);
  // Note: role-based view redirect is handled by AuthGate's useEffect —
  // do NOT call setView during render (causes React setState-in-render error).

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header (sticky top) — respects safe area on notched devices */}
      <header className="sticky top-0 z-40 bg-sidebar text-sidebar-foreground flex items-center px-3 sm:px-4 gap-3 safe-top" style={{ minHeight: "3.5rem" }}>
        <button
          className="lg:hidden p-2 -ml-1 rounded-md hover:bg-sidebar-accent shrink-0"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <div className="lg:hidden min-w-0">
          <LogoLockup compact />
        </div>
        <div className="hidden lg:flex items-center gap-2 text-sm text-sidebar-foreground/70">
          <Waves className="size-4 text-aqua" />
          <span>Smart Swim Timing</span>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="hidden sm:flex flex-col items-end leading-tight min-w-0">
            <span className="text-sm font-medium truncate max-w-[150px]">{user?.fullName}</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              {user?.role.replace("_", " ")}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="hidden sm:inline-flex bg-aqua/20 text-aqua border-aqua/30 shrink-0"
          >
            {current?.label}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0"
            onClick={() => signOut({ redirect: false }).then(() => window.location.reload())}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-60 flex-col border-r bg-sidebar shrink-0">
          <div className="p-4 border-b border-sidebar-border">
            <LogoLockup />
          </div>
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto lp-scroll">
            {items.map((item) => {
              const Icon = item.icon;
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left",
                    active
                      ? "bg-aqua text-white shadow-sm"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border text-[10px] text-sidebar-foreground/50">
            LanePulse Pro v1.1 • 12-Lane Pool
          </div>
        </aside>

        {/* Mobile slide-over sidebar */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="relative w-64 max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col animate-in slide-in-from-left safe-top">
              <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
                <LogoLockup compact />
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-md hover:bg-sidebar-accent"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex-1 p-2 space-y-1 overflow-y-auto lp-scroll">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        setView(item.key);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors text-left",
                        active
                          ? "bg-aqua text-white"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="p-3 border-t border-sidebar-border text-[10px] text-sidebar-foreground/50 safe-bottom">
                {user?.fullName} • {user?.role.replace("_", " ")}
              </div>
            </aside>
          </div>
        )}

        {/* Main content — extra bottom padding on mobile so content never hides behind bottom nav */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 p-3 sm:p-4 lg:p-6 pb-24 lg:pb-6">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav — respects iOS safe area */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex items-stretch lp-bottom-nav" style={{ minHeight: "3.5rem" }}>
        {items.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          const label = item.mobileLabel || item.label.split(" ")[0];
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors min-w-0 py-1",
                active
                  ? "text-aqua"
                  : "text-sidebar-foreground/60"
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-sidebar-foreground/60 min-w-0 py-1"
        >
          <Menu className="size-5 shrink-0" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
