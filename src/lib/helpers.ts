// LanePulse Pro - shared utility helpers

import bcrypt from "bcryptjs";

/** Hash a password using bcrypt */
export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

/** Verify a password against a bcrypt hash */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Format milliseconds as MM:ss.cc (e.g. 01:23.45) */
export function formatMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "00:00.00";
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) {
    return `${pad(hr)}:${pad(min % 60)}:${pad(sec)}.${pad(cs)}`;
  }
  return `${pad(min)}:${pad(sec)}.${pad(cs)}`;
}

/** Format seconds as MM:ss.cc */
export function formatSeconds(sec: number): string {
  return formatMs(sec * 1000);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Build an automatic session name: Style - Xm - Group - yyyy-mm-dd HH:mm */
export function buildSessionName(
  styleName: string,
  distanceMeters: number,
  groupName: string,
  date: Date = new Date()
): string {
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `${styleName} - ${distanceMeters}m - ${groupName} - ${stamp}`;
}

/** Standard 12-lane pool lanes */
export const POOL_LANES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Default swimming styles seed */
export const DEFAULT_STYLES = [
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
];

/** Role check helpers */
export function canManageSwimmers(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "COACH";
}
export function canRunSessions(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "COACH";
}
export function canDeleteEverything(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}
export function canManageUsers(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}
export function canViewReports(role?: string | null): boolean {
  return role === "SUPER_ADMIN" || role === "COACH" || role === "VIEWER";
}
