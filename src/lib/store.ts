// LanePulse Pro - frontend Zustand stores

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LiveLaneState,
  LaneStatus,
  TimerMode,
  SessionStatus,
  Role,
  UserDTO,
  GroupMemberDTO,
} from "@/lib/types";
import { POOL_LANES } from "@/lib/helpers";

// ============================================================
// APP STORE — navigation + current user (NOT persisted)
// ============================================================

export type ViewKey =
  | "dashboard"
  | "timer"
  | "swimmers"
  | "groups"
  | "history"
  | "analysis"
  | "admin"
  | "settings";

interface AppState {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  user: UserDTO | null;
  setUser: (u: UserDTO | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
  hasSetup: boolean;
  setHasSetup: (b: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "timer", // Fast Timing Console is DEFAULT per spec
  setView: (v) => set({ view: v }),
  user: null,
  setUser: (u) => set({ user: u }),
  sidebarOpen: false,
  setSidebarOpen: (b) => set({ sidebarOpen: b }),
  hasSetup: false,
  setHasSetup: (b) => set({ hasSetup: b }),
}));

export function canAccess(view: ViewKey, role: Role | undefined | null): boolean {
  if (!role) return false;
  if (view === "admin" || view === "settings") return role === "SUPER_ADMIN";
  return true;
}

// ============================================================
// TIMER STORE — the critical timing console state
// Persisted to localStorage so refreshes don't lose running timers
// ============================================================

interface SessionMeta {
  sessionId: string | null; // assigned after first save
  sessionName: string;
  sessionDate: string; // ISO
  styleId: string;
  styleName: string;
  distanceMeters: number;
  status: SessionStatus;
  remarks: string;
}

interface TimerState {
  // Group state — NEVER MIX (per spec lesson #1)
  selectedGroupId: string | null;
  selectedGroupName: string | null;
  loadedGroupId: string | null;
  loadedGroupName: string | null;
  nextGroupId: string | null;
  nextGroupName: string | null;

  // Session meta
  meta: SessionMeta;

  // 12 lanes (always length 12)
  lanes: LiveLaneState[];

  // UI mode
  mode: TimerMode;

  // Dirty flag (unsaved timings)
  dirty: boolean;

  // ---- actions ----
  setSelectedGroup: (id: string | null, name: string | null) => void;
  setNextGroup: (id: string | null, name: string | null) => void;
  setMeta: (partial: Partial<SessionMeta>) => void;
  setMode: (m: TimerMode) => void;

  // Load selected group into the timing board (does NOT auto-run)
  loadSelectedGroup: (members: GroupMemberDTO[]) => void;
  // Load next group (after saving current) into the timing board
  loadNextGroup: (members: GroupMemberDTO[]) => void;

  // Per-lane controls
  startLane: (laneNo: number) => void;
  stopLane: (laneNo: number) => void;
  lapLane: (laneNo: number) => void;
  resetLane: (laneNo: number) => void;
  setLaneStatus: (laneNo: number, status: LaneStatus) => void;

  // Bulk
  startAllReady: () => void;
  stopAllRunning: () => void;
  resetAll: () => void;

  // After save
  markSaved: () => void;
  clearAll: () => void;
}

function emptyLane(laneNo: number): LiveLaneState {
  return {
    laneNo,
    swimmerId: null,
    swimmerName: null,
    status: "IDLE",
    startedAt: null,
    stoppedAt: null,
    elapsedMs: 0,
    lastLapMs: null,
    lastLapCumulative: null,
    laps: [],
  };
}

function freshLanes(): LiveLaneState[] {
  return POOL_LANES.map(emptyLane);
}

function freshMeta(): SessionMeta {
  return {
    sessionId: null,
    sessionName: "",
    sessionDate: new Date().toISOString(),
    styleId: "",
    styleName: "",
    distanceMeters: 50,
    status: "DRAFT",
    remarks: "",
  };
}

const initialTimer: Omit<
  TimerState,
  | "setSelectedGroup"
  | "setNextGroup"
  | "setMeta"
  | "setMode"
  | "loadSelectedGroup"
  | "loadNextGroup"
  | "startLane"
  | "stopLane"
  | "lapLane"
  | "resetLane"
  | "setLaneStatus"
  | "startAllReady"
  | "stopAllRunning"
  | "resetAll"
  | "markSaved"
  | "clearAll"
> = {
  selectedGroupId: null,
  selectedGroupName: null,
  loadedGroupId: null,
  loadedGroupName: null,
  nextGroupId: null,
  nextGroupName: null,
  meta: freshMeta(),
  lanes: freshLanes(),
  mode: "console",
  dirty: false,
};

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      ...initialTimer,

      setSelectedGroup: (id, name) =>
        set({ selectedGroupId: id, selectedGroupName: name }),
      setNextGroup: (id, name) =>
        set({ nextGroupId: id, nextGroupName: name }),
      setMeta: (partial) =>
        set((s) => ({ meta: { ...s.meta, ...partial } })),
      setMode: (m) => set({ mode: m }),

      loadSelectedGroup: (members) => {
        const lanes = freshLanes();
        for (const m of members) {
          if (m.laneNo >= 1 && m.laneNo <= 12) {
            lanes[m.laneNo - 1] = {
              ...lanes[m.laneNo - 1],
              swimmerId: m.swimmerId,
              swimmerName: m.swimmerName || m.swimmer?.swimmerName || null,
              status: "READY",
            };
          }
        }
        set((s) => ({
          lanes,
          loadedGroupId: s.selectedGroupId,
          loadedGroupName: s.selectedGroupName,
          meta: { ...s.meta, status: "RUNNING" },
          dirty: false,
        }));
      },

      loadNextGroup: (members) => {
        const lanes = freshLanes();
        for (const m of members) {
          if (m.laneNo >= 1 && m.laneNo <= 12) {
            lanes[m.laneNo - 1] = {
              ...lanes[m.laneNo - 1],
              swimmerId: m.swimmerId,
              swimmerName: m.swimmerName || m.swimmer?.swimmerName || null,
              status: "READY",
            };
          }
        }
        set((s) => ({
          lanes,
          loadedGroupId: s.nextGroupId,
          loadedGroupName: s.nextGroupName,
          meta: {
            ...s.meta,
            sessionId: null,
            status: "RUNNING",
            sessionStartTime: undefined as any,
            sessionEndTime: undefined as any,
          },
          dirty: false,
        }));
      },

      startLane: (laneNo) =>
        set((s) => {
          const lanes = s.lanes.map((l) => {
            if (l.laneNo !== laneNo) return l;
            if (l.status === "RUNNING" || l.status === "FINISHED") return l;
            // preserve startedAt if resuming? No — start fresh.
            return {
              ...l,
              status: "RUNNING" as LaneStatus,
              startedAt: Date.now(),
              stoppedAt: null,
            };
          });
          return { lanes, dirty: true };
        }),

      stopLane: (laneNo) =>
        set((s) => {
          const now = Date.now();
          const lanes = s.lanes.map((l) => {
            if (l.laneNo !== laneNo) return l;
            if (l.status !== "RUNNING") return l;
            return {
              ...l,
              status: "FINISHED" as LaneStatus,
              stoppedAt: now,
              elapsedMs: l.startedAt ? now - l.startedAt : 0,
            };
          });
          return { lanes, dirty: true };
        }),

      lapLane: (laneNo) =>
        set((s) => {
          const now = Date.now();
          const lanes = s.lanes.map((l) => {
            if (l.laneNo !== laneNo) return l;
            if (l.status !== "RUNNING" || !l.startedAt) return l;
            const cumulativeMs = now - l.startedAt;
            const prevCum = l.lastLapCumulative ?? 0;
            const lapMs = cumulativeMs - prevCum;
            return {
              ...l,
              lastLapMs: lapMs,
              lastLapCumulative: cumulativeMs,
              laps: [
                ...l.laps,
                {
                  lapNo: l.laps.length + 1,
                  lapMs,
                  cumulativeMs,
                },
              ],
            };
          });
          return { lanes, dirty: true };
        }),

      resetLane: (laneNo) =>
        set((s) => {
          const lanes = s.lanes.map((l) => {
            if (l.laneNo !== laneNo) return l;
            const wasReady = l.swimmerId !== null;
            return {
              ...emptyLane(laneNo),
              swimmerId: l.swimmerId,
              swimmerName: l.swimmerName,
              status: (wasReady ? "READY" : "IDLE") as LaneStatus,
            };
          });
          return { lanes, dirty: true };
        }),

      setLaneStatus: (laneNo, status) =>
        set((s) => ({
          lanes: s.lanes.map((l) =>
            l.laneNo === laneNo ? { ...l, status } : l
          ),
          dirty: true,
        })),

      startAllReady: () =>
        set((s) => {
          const now = Date.now();
          const lanes = s.lanes.map((l) => {
            if (l.status !== "READY") return l;
            return {
              ...l,
              status: "RUNNING" as LaneStatus,
              startedAt: now,
              stoppedAt: null,
            };
          });
          return {
            lanes,
            dirty: true,
            meta: { ...s.meta, status: "RUNNING", sessionStartTime: new Date().toISOString() as any },
          };
        }),

      stopAllRunning: () =>
        set((s) => {
          const now = Date.now();
          const lanes = s.lanes.map((l) => {
            if (l.status !== "RUNNING") return l;
            return {
              ...l,
              status: "FINISHED" as LaneStatus,
              stoppedAt: now,
              elapsedMs: l.startedAt ? now - l.startedAt : 0,
            };
          });
          return { lanes, dirty: true };
        }),

      resetAll: () =>
        set((s) => {
          const lanes = s.lanes.map((l) => {
            const wasReady = l.swimmerId !== null;
            return {
              ...emptyLane(l.laneNo),
              swimmerId: l.swimmerId,
              swimmerName: l.swimmerName,
              status: (wasReady ? "READY" : "IDLE") as LaneStatus,
            };
          });
          return { lanes, dirty: true };
        }),

      markSaved: () =>
        set((s) => ({
          dirty: false,
          meta: { ...s.meta, status: "COMPLETED" as SessionStatus },
        })),

      clearAll: () =>
        set({
          ...initialTimer,
          lanes: freshLanes(),
          meta: freshMeta(),
        }),
    }),
    {
      name: "lanepulse-timer-v1",
      // Only persist the data, not the action functions
      partialize: (s) => ({
        selectedGroupId: s.selectedGroupId,
        selectedGroupName: s.selectedGroupName,
        loadedGroupId: s.loadedGroupId,
        loadedGroupName: s.loadedGroupName,
        nextGroupId: s.nextGroupId,
        nextGroupName: s.nextGroupName,
        meta: s.meta,
        lanes: s.lanes,
        mode: s.mode,
        dirty: s.dirty,
      }),
    }
  )
);

// ============================================================
// Live tick hook — drives running timer displays
// ============================================================
import { useEffect, useState } from "react";

export function useTick(intervalMs = 50): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

/** Compute live elapsed ms for a lane (handles running vs finished) */
export function liveElapsedMs(lane: LiveLaneState): number {
  if (lane.status === "RUNNING" && lane.startedAt) {
    return Date.now() - lane.startedAt;
  }
  if (lane.status === "FINISHED" && lane.startedAt && lane.stoppedAt) {
    return lane.stoppedAt - lane.startedAt;
  }
  return lane.elapsedMs;
}
