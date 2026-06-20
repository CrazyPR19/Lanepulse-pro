# LanePulse Pro — Mobile Publishing Guide

A practical roadmap for testing, shipping, and packaging LanePulse Pro as a
mobile-friendly PWA today, plus an optional Capacitor path for native iOS /
Android builds in the future.

> **Stack context** — Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 +
> shadcn/ui + Zustand + TanStack Query + Recharts. Server-rendered React with
> API routes under `/api/...`. Database: Prisma + SQLite. Auth: NextAuth.js v4.

---

## Table of Contents

1. [Current PWA Status](#1-current-pwa-status)
2. [Testing as a PWA](#2-testing-as-a-pwa)
3. [Local Network Testing](#3-local-network-testing)
4. [Future Capacitor Steps](#4-future-capacitor-steps)
5. [Environment-Based API URL](#5-environment-based-api-url)
6. [Building Android APK / AAB](#6-building-android-apk--aab)
7. [Building iOS](#7-building-ios)
8. [Production API URL](#8-production-api-url)
9. [Mobile Testing Checklist](#9-mobile-testing-checklist)
10. [Current Limitations](#10-current-limitations)

---

## 1. Current PWA Status

LanePulse Pro is already a Progressive Web App out of the box. The following
PWA primitives are in place:

| Primitive | Location | Value |
|---|---|---|
| Web App Manifest | `public/manifest.webmanifest` | `name`, `short_name`, `start_url: "/"`, `display: standalone`, `background_color: #0b1f3a`, `theme_color: #0b1f3a`, `orientation: any` |
| Manifest link | `src/app/layout.tsx` → `metadata.manifest` | `/manifest.webmanifest` |
| Apple Web App | `src/app/layout.tsx` → `metadata.appleWebApp` | `capable: true`, `statusBarStyle: "default"`, `title: "LanePulse Pro"` |
| Theme color | `src/app/layout.tsx` → `viewport.themeColor` | `#0b1f3a` (navy) |
| Viewport | `src/app/layout.tsx` → `viewport` | `width: device-width`, `initialScale: 1`, `maximumScale: 1`, `userScalable: false`, `viewportFit: cover` |
| App icon | `public/logo.svg` | SVG, `purpose: "any maskable"` |
| Safe-area CSS | `src/app/globals.css` | `.safe-top`, `.safe-bottom`, `.safe-x`, `.lp-bottom-nav` |
| Mobile bottom nav | `src/components/app-shell.tsx` | Fixed bottom nav with `.lp-bottom-nav` (respects iOS safe area) |

### Safe-area CSS classes (already defined)

```css
.safe-top    { padding-top:    env(safe-area-inset-top);    }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.safe-x      { padding-left:   env(safe-area-inset-left);
               padding-right:  env(safe-area-inset-right); }
.lp-bottom-nav { padding-bottom: env(safe-area-inset-bottom);
                 box-sizing: content-box; }
```

The sticky header uses `.safe-top` and the mobile bottom nav uses
`.lp-bottom-nav` so content never collides with notches or the iOS home
indicator.

### What this means

- The app is **installable** on iOS (Safari → Share → Add to Home Screen) and
  Android (Chrome → menu → Install app).
- Once installed, it launches in its own standalone window (no browser
  chrome), with the navy theme color in the status bar.
- The viewport is locked to `1.0` and `userScalable: false` to prevent
  accidental pinch-zoom during fast timing — coaches can't have the timing
  console jump around mid-race.
- `viewportFit: cover` lets the app extend into safe-area insets, and the
  safe-area classes above add the correct padding so the header and bottom
  nav don't sit under the notch.

---

## 2. Testing as a PWA

### Install on iOS (Safari)

1. Open the app URL in **Safari** on the iPhone/iPad.
2. Tap the **Share** icon (square with an up arrow) at the bottom of the
   screen.
3. Scroll down and tap **Add to Home Screen**.
4. Edit the title if you want (default is `LanePulse Pro`), then tap **Add**.
5. Launch from the home screen icon — it opens in standalone mode (no
   Safari chrome).

> **Note:** iOS Safari is the only browser on iOS that supports "Add to Home
> Screen" with PWA installation. Chrome/Firefox on iOS do not have this
> capability.

### Install on Android (Chrome)

1. Open the app URL in **Chrome** on the Android device.
2. Tap the **three-dot menu** in the top-right.
3. Tap **Install app** (or **Add to Home screen** on some devices).
4. Confirm the install prompt.
5. Launch from the home screen / app drawer — it opens in a standalone
   Chrome Custom Tab with its own window.

Chrome may also show an **"Install"** mini-infobar at the bottom of the
screen the first time you visit. Tap it for the same flow.

### Install on Desktop (Chrome / Edge)

1. Open the app URL in Chrome or Edge.
2. Click the **install icon** in the address bar (a circle with a `+` or a
   monitor-with-down-arrow), OR open the three-dot menu → **Install LanePulse
   Pro**.
3. The app installs as a native-looking window with its own taskbar icon.

---

## 3. Local Network Testing

To preview the dev server from a real phone on the same Wi-Fi network:

### Start the dev server bound to all interfaces

```bash
# The project's dev script already binds to 0.0.0.0 via Next.js defaults.
bun run dev
# Equivalent explicit form:
# bun run next dev -p 3000 -H 0.0.0.0
```

In this sandbox, the Next.js dev server already listens on `0.0.0.0:3000`.
A Caddy gateway (see `Caddyfile`) routes external traffic to it. You don't
need to start anything else.

### Find your machine's LAN IP

```bash
# macOS / Linux
ifconfig | grep "inet " | grep -v 127.0.0.1
# Look for something like 192.168.1.42 or 10.0.0.5

# Windows
ipconfig
# Look for "IPv4 Address" under your active Wi-Fi / Ethernet adapter
```

### Open on the phone

On the phone, open the browser and navigate to:

```
http://192.168.1.42:3000
```

(substitute your machine's actual LAN IP). Make sure:

- Phone and computer are on the **same Wi-Fi network**.
- Your computer's firewall allows inbound TCP on port 3000 (macOS will
  prompt the first time — click **Allow**).
- If your Wi-Fi is isolated (guest networks often are), devices won't see
  each other — use a hotspot or a non-isolated network.

> **Sandbox note:** This sandbox exposes a single external port via the
> Caddyfile gateway. Internal services on different ports are addressed
> via the `?XTransformPort=<port>` query parameter — see `Caddyfile` for
> details. For ordinary dev preview, this is transparent.

---

## 4. Future Capacitor Steps

> **Documentation only — do NOT install Capacitor now.** This section is the
> roadmap for when the team decides to ship native iOS / Android binaries.

[Capacitor](https://capacitorjs.com) wraps the built static site in a native
webview. The same Next.js build runs inside the webview, so you keep 100% of
the UI code and only add a thin native shell for app-store distribution,
push notifications, native file access, etc.

### 4.1 Install the Capacitor CLI and core package

```bash
npm install @capacitor/core @capacitor/cli
```

- `@capacitor/core` — the runtime that loads your web build into the
  native webview and bridges JavaScript ↔ native calls.
- `@capacitor/cli` — the command-line tool used to init the project, add
  native platforms, sync assets, and open native IDEs.

### 4.2 Initialize Capacitor

```bash
npx cap init LanePulsePro com.lanepulse.pro
```

- `LanePulsePro` — the human-readable app name (no spaces recommended).
- `com.lanepulse.pro` — the reverse-DNS app ID used by both iOS (Bundle
  Identifier) and Android (Application ID). Pick something unique and
  stable; you can't easily change it after publishing.

This creates a `capacitor.config.ts` (or `.json`) at the project root. Edit
it to point `webDir` at the static export folder (see §10 for the
`output: export` consideration):

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lanepulse.pro",
  appName: "LanePulsePro",
  webDir: "out", // or ".next/standalone" depending on your build strategy
  server: {
    androidScheme: "https",
  },
};
export default config;
```

### 4.3 Build the Next.js app

```bash
npm run build
```

This produces `.next/` (and, with `output: export` in `next.config.ts`, an
`out/` folder containing a fully static site that Capacitor can bundle).

### 4.4 Add native platforms

```bash
npx cap add android
npx cap add ios
```

- `cap add android` — generates the `android/` Gradle project, copies your
  web build into `android/app/src/main/assets/public`, and configures the
  webview.
- `cap add ios` — generates the `ios/` Xcode project (CocoaPods) with the
  same web assets bundled in. **Requires macOS** to run.

You only run these once per project. After that, you `cap sync` to refresh
the web assets inside the native projects whenever you rebuild the web app.

### 4.5 Sync web assets into native projects

```bash
npx cap sync
```

`cap sync` does three things:

1. **Copy** — copies the contents of `webDir` (your `out/` or build folder)
   into both `android/app/src/main/assets/public/` and the iOS app bundle.
2. **Update** — refreshes native plugins (any `@capacitor/*` plugin native
   code) and the Capacitor runtime in both native projects.
3. **Migrate** — applies any Capacitor config changes to native configs.

Run this every time after you rebuild the web app, before opening or
building the native projects.

### 4.6 Open in native IDEs

```bash
npx cap open android   # opens Android Studio
npx cap open ios       # opens Xcode (macOS only)
```

From there you can run on a simulator/emulator, run on a connected device,
archive for release, etc.

---

## 5. Environment-Based API URL

The app currently uses **relative API paths** exclusively via
`src/lib/api-client.ts`:

```ts
// src/lib/api-client.ts (current — relative paths)
const res = await fetch(url, { ... }); // url is "/api/..." — same-origin
```

This works perfectly for:

- Dev server (`http://localhost:3000/api/...`)
- Production deployment behind a reverse proxy (Caddy, Nginx, Vercel, etc.)
- PWA installs (the manifest's `start_url: "/"` keeps the same origin)

For Capacitor / native webview builds, the app is loaded from a `file://` or
`capacitor://` URL — there is no same-origin server. So API calls must be
directed at an absolute URL pointing at a deployed LanePulse Pro backend.

### Recommended pattern (documented, NOT implemented yet)

1. Add a public env var in `next.config.ts` or `.env.local`:

   ```bash
   # .env.local (or your CI/CD secret store)
   NEXT_PUBLIC_API_BASE_URL=https://api.lanepulsepro.example.com
   ```

   The `NEXT_PUBLIC_` prefix exposes the value to the browser bundle.

2. Update `src/lib/api-client.ts` to prefix the base URL when present:

   ```ts
   // src/lib/api-client.ts (future pattern — do NOT apply now)
   const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

   async function req<T>(url: string, options?: RequestInit): Promise<T> {
     const res = await fetch(`${BASE}${url}`, {
       ...options,
       headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
     });
     // ... rest unchanged
   }
   ```

3. For native builds, set `NEXT_PUBLIC_API_BASE_URL` at build time to the
   production API URL (e.g. `https://api.lanepulsepro.example.com`). For
   web/PWA builds, leave it empty (`""`) so calls go to the same origin.

4. Configure CORS on the production API server to allow the Capacitor
   origin (`capacitor://localhost` on iOS, `http://localhost` on Android).

5. **WebSocket note** — if you add Socket.io later (e.g. for live lane
   timing across devices), apply the same pattern: `io("/?XTransformPort=3003")`
   becomes `io(`${BASE}/?XTransformPort=3003`)` for native builds. Don't
   hardcode `http://localhost:` in any client code.

### Auth caveat

NextAuth.js v4 uses cookies for session management. For Capacitor builds,
configure NextAuth to use a JWT session strategy (already the case in
`src/lib/auth.ts`) and consider switching to Bearer-token auth for native
clients, since cookie domain/path semantics are awkward in a `capacitor://`
webview. This is a future engineering task — not needed for PWA today.

---

## 6. Building Android APK / AAB

> Requires Android Studio + JDK 17 (Android Studio Hedgehog or later
> bundles the right JDK).

### Option A — Build from the command line

```bash
# After `npx cap sync` has copied the latest web assets:
npx cap build android
```

This runs the Gradle `assembleRelease` task and prints the path to the
generated `.apk` file (typically
`android/app/build/outputs/apk/release/app-release.apk`).

For an `.aab` (Android App Bundle — required for Google Play Store upload):

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Option B — Build in Android Studio

```bash
npx cap open android
```

In Android Studio:

1. **Build → Generate Signed Bundle / APK**
2. Choose **APK** for direct sideload testing, or **Android App Bundle** for
   Play Store upload.
3. Create or select your keystore (keep this safe — you can't update the
   app on Play Store without the same keystore).
4. Pick **release** build variant.
5. Finish — Studio builds and shows the output file location.

### Sideload an APK for testing

```bash
# Enable USB debugging on the phone (Developer Options), plug it in:
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or just email the `.apk` to yourself and tap to install on the phone
(requires "Install from unknown sources" enabled for the browser/email
app).

---

## 7. Building iOS

> **Requires a Mac** running the latest Xcode. No cross-compilation
> possible from Windows or Linux.

### Open in Xcode

```bash
npx cap open ios
```

### Run on a simulator or connected device

In Xcode:

1. Pick a target (simulator or your connected iPhone/iPad) from the
   top-center scheme dropdown.
2. Press **Cmd+R** to build and run.

### Archive for App Store / TestFlight

1. Pick **Any iOS Device (arm64)** as the scheme target (not a simulator).
2. **Product → Archive** (Cmd+Shift+B builds; archiving is in the menu).
3. After archiving, Xcode opens the **Organizer** window.
4. Click **Distribute App** → choose **App Store Connect** (for TestFlight
   + App Store) or **Development** / **Ad Hoc** for direct device installs.
5. Follow the wizard to upload.

### Apple Developer Account

You need a paid **Apple Developer Program** membership ($99/year) to:

- Submit to the App Store / TestFlight.
- Get signing certificates and provisioning profiles for distribution.

For local development testing on your own device, a free Apple ID works,
but the app expires after 7 days and you're limited to 3 apps installed at
a time.

---

## 8. Production API URL

When deploying LanePulse Pro to a real server (Vercel, Railway, Fly.io, a
self-hosted VM, etc.), set these environment variables on the production
host:

| Variable | Value | Purpose |
|---|---|---|
| `NEXTAUTH_URL` | `https://app.lanepulsepro.example.com` | The canonical public URL of the deployed app. NextAuth uses this for redirect URLs and cookie domain. Must match the URL users actually visit. |
| `NEXTAUTH_SECRET` | (random 32+ char string) | JWT signing secret. Generate with `openssl rand -base64 32`. Never commit. |
| `DATABASE_URL` | `file:./prisma/lanepulse-pro.db` (or a real DB URL) | Prisma connection string. SQLite stays as a local file; for multi-instance deployments, switch to PostgreSQL. |
| `NEXT_PUBLIC_API_BASE_URL` | (empty for web/PWA, set for Capacitor — see §5) | Optional absolute API base for native builds. |

After deploying, smoke-test:

1. Visit `https://app.lanepulsepro.example.com` — should show the setup
   wizard on first run (no users yet) or the login screen.
2. Complete setup, log in, run through the mobile testing checklist below.
3. Install as PWA on a phone — confirm login persists across app restarts
   (NextAuth JWT in cookie).

---

## 9. Mobile Testing Checklist

Run through this checklist on a real phone (or a narrow browser window at
390×844 for iPhone 12/13/14 sizing) before each release:

### Authentication & Navigation
- [ ] **Login** — username + password form is usable on mobile, no
      horizontal scroll, error toasts are visible above the keyboard.
- [ ] **Bottom navigation** — all 4 primary nav items + "More" button are
      tappable, icons + labels visible, active state shows aqua.
- [ ] **Sidebar (mobile)** — tapping "More" opens the slide-over sidebar
      with all accessible views; tapping outside closes it.
- [ ] **Sign out** — works from the header; user returns to login screen.

### Timing Console (the critical path)
- [ ] **Session setup** — style/distance/group selectors render correctly,
      no overlap with the "Load Selected" button.
- [ ] **12-lane board** — all 12 lanes visible on mobile (responsive grid),
      lane numbers + swimmer names readable, no horizontal scroll.
- [ ] **Fast Timing Console** — default mode; Start/Stop/Lap buttons are
      ≥44px touch targets and don't overlap when a lane is running.
- [ ] **Finish Capture Mode** — large 3×4 / 4×3 buttons tappable, lane
      status updates immediately on tap.
- [ ] **Lap Capture Mode** — large buttons work; #lap-count badges update.
- [ ] **Bulk controls** — Start All Ready / Stop All Running / Reset /
      Complete & Save all reachable, with confirmation toasts.
- [ ] **Next Heat / Quick Start** — "Save Current, Then Load Next" dialog
      appears, doesn't overlap the bottom nav.

### Data Capture & History
- [ ] **Finish capture** — recorded times persist after lane is stopped.
- [ ] **Lap capture** — per-lap splits appear in the lane detail.
- [ ] **Complete & Save** — session persisted with auto-generated name
      (Style - Distance - Group - YYYY-MM-DD HH:mm).
- [ ] **Session History** — list renders as cards on mobile (table on
      desktop), filters reachable, CSV export downloads a file.

### Parent Portal (PARENT role)
- [ ] **Parent dashboard** — logs in as a PARENT user, lands on "My Child"
      view by default (not the timing console).
- [ ] **Child selector** — if multiple children, dropdown works; if one,
      auto-selected.
- [ ] **Summary cards** — Total Sessions / Latest Time / Best Time /
      Improvement all render with large readable text.
- [ ] **Progress chart** — Recharts LineChart renders, aqua line visible,
      no horizontal overflow on mobile.
- [ ] **Best Times table** — scrollable if long, no horizontal scroll of the
      page itself.
- [ ] **Coach Recommendations** — cards render with aqua accent, bullet
      points readable.
- [ ] **Lap Consistency** — only shows when not null; endurance drop
      warning displays when flagged.
- [ ] **Last 5 Sessions** — compact rows, dates and times readable.

### General Mobile UX
- [ ] **No horizontal scroll** on any view at 390px width.
- [ ] **No overlap** between content and the fixed bottom nav (main content
      has `pb-24 lg:pb-6` padding to clear the bottom nav).
- [ ] **No overlap** between content and the sticky header.
- [ ] **Buttons easy to tap** — all primary actions ≥44px height
      (`h-11` / `h-12` for important buttons, `size="lg"` on shadcn buttons
      where applicable).
- [ ] **Toasts visible** — sonner toasts appear at top-center, above any
      bottom nav or sticky header.
- [ ] **Forms scroll** — long forms (e.g. Add Swimmer, New Group) scroll
      inside their dialog without losing the action buttons.
- [ ] **Dark mode** — toggle dark mode and re-check: no white-on-white
      cards, all text readable, aqua accents stay visible.

### Safe-Area / Notch Devices (iPhone 14+ / Android with notch)
- [ ] **Status bar** — app content doesn't hide behind the notch or Dynamic
      Island (`.safe-top` on header).
- [ ] **Home indicator** — bottom nav doesn't sit under the home indicator
      (`.lp-bottom-nav` adds `env(safe-area-inset-bottom)`).
- [ ] **Landscape** — rotate to landscape; layout doesn't break, bottom
      nav still reachable.

---

## 10. Current Limitations

### Next.js SSR requires a running server

LanePulse Pro is **not** a fully static site. It uses:

- Server-rendered React (App Router with `layout.tsx`, `page.tsx`).
- API routes under `/api/...` (NextAuth, Prisma, all business logic).
- NextAuth.js session cookies (signed by `NEXTAUTH_SECRET` on the server).
- Prisma + SQLite (server-side only — the browser never touches the DB).

This means the production deployment needs a **running Node.js / Bun
server**, not a CDN-hosted static bundle. Hosting options that work:

- **Vercel** — Next.js native, supports serverless API routes + Edge.
- **Railway / Fly.io / Render** — long-running Node container; run `bun run
  start` (or `npm run start`) after building.
- **Self-hosted VM** — `bun run build && bun run start` behind Nginx/Caddy.
- **Docker** — bundle the standalone output (`.next/standalone/`) into an
  image.

### Capacitor considerations

For a Capacitor build, you have two options:

1. **`output: export` in `next.config.ts`** — produces a fully static site
   in `out/`. This works for a client-only PWA-style experience, but
   **breaks all server-side features**: API routes, NextAuth, Prisma. You'd
   need to:
   - Move all API logic to a separate backend (Express, Fastify, etc.) that
     the static app calls into via `NEXT_PUBLIC_API_BASE_URL`.
   - Replace NextAuth with a client-side auth library or a custom JWT flow
     that hits the new backend.
   - This is a significant refactor.

2. **Keep a backend server, point the app at it** — leave `next.config.ts`
   as-is (no `output: export`), deploy the Next.js app to a real server,
   set `NEXT_PUBLIC_API_BASE_URL` to the deployed API URL, and bundle only
   the static frontend assets into the Capacitor shell. The native app
   becomes a thin webview that talks to the deployed backend. **This is the
   recommended path** — minimal code changes, full feature parity.

   Concretely:
   - Build a `out/` export of just the frontend (using `output: export`
     with all API routes guarded out, OR a separate minimal Next.js app
     containing only pages).
   - Point `NEXT_PUBLIC_API_BASE_URL` at the production API.
   - `cap sync` the `out/` folder into the native projects.
   - Ship the native app — it talks to your deployed LanePulse Pro backend
     for everything auth, data, and timing-related.

### Prisma + SQLite + multi-device

For a single-instance deployment (one server process), SQLite is fine. If
you scale to multiple instances (horizontal scaling), switch the Prisma
datasource to PostgreSQL (or MySQL) — update `prisma/schema.prisma`'s
`datasource` provider and `DATABASE_URL`. The Prisma Client API stays the
same; only the connection string changes.

### NextAuth cookies in webviews

NextAuth.js v4 uses HTTP cookies for the session. In a Capacitor webview
(`capacitor://localhost` on iOS, `http://localhost` on Android), cookie
behavior is mostly fine but can be fragile across app reinstalls. If you
hit session-persistence issues in production:

- Switch the Capacitor build to **Bearer-token auth** (a thin custom JWT
  flow on top of the existing `/api/auth/[...nextauth]` route, or a
  dedicated `/api/auth/native-login` endpoint that returns a JWT the
  webview stores in `localStorage`).
- The server-rendered web/PWA app keeps using NextAuth cookies unchanged.

### Service worker / offline cache

The current PWA setup does **not** include a service worker (no
`next-pwa`, no Workbox). This means:

- The app requires a network connection to load.
- After install, the app shell is cached by the browser/OS but data fetches
  still require network.

If offline-first becomes a requirement, add `next-pwa` (or a hand-rolled
Workbox config) and cache the app shell + static assets. Be careful not to
cache API responses unless they're explicitly safe to stale-serve (auth,
timing data, etc. are not).

---

## Summary

**Today (PWA):**

- Already installable on iOS / Android / Desktop.
- Sporty navy/aqua theme, safe-area aware, mobile-first.
- Test on your phone over Wi-Fi: `bun run dev` → find LAN IP →
  `http://<IP>:3000`.
- Install via Safari "Add to Home Screen" (iOS) or Chrome "Install app"
  (Android).

**Future (Capacitor):**

- Wrap the same Next.js build in a native webview for App Store / Play
  Store distribution.
- Set `NEXT_PUBLIC_API_BASE_URL` at build time to your deployed API URL.
- Keep the Next.js backend running on a real server (don't switch to
  `output: export` — you'd lose all API routes and auth).
- iOS builds require a Mac + Xcode + Apple Developer account. Android
  builds require Android Studio + a keystore.

**Production:**

- Set `NEXTAUTH_URL` to your public domain.
- Set `NEXTAUTH_SECRET` to a random 32+ char string.
- Run the mobile testing checklist before every release.
