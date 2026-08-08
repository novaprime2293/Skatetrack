# 🛹 Skatetrack

A fast, dark-themed, offline-first attendance tracker for skateboard coaches. Built as a Progressive Web App — install it on your phone home screen and it works like a native app.

## What it does

- **Swipe-card attendance** — full-screen swipe right (present) / left (absent), tap buttons as backup
- **Batches** — recurring class groups (e.g. "Tuesday Beginners, 4-5 PM")
- **Students** — name, optional parent contact, track which batches they belong to
- **Per-student calendar** — month grid showing present (green) / absent (red) / no class
- **Missed-attendance nudge** — pops up on app open if any class ended without attendance
- **Cancel class** — 4 prelisted reasons ("Rained out", "Public holiday", etc.) + Other
- **Home stats** — total students, batches, sessions this month, attendance rate
- **Analytics** — week-over-week trend, per-batch breakdown, per-student ranking
- **Offline-first** — works without internet, data persists on your phone
- **Auto-backup** — every change is saved to IndexedDB; export JSON anytime

## Tech stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS 4
- Framer Motion (swipe gestures)
- Zustand (state)
- IndexedDB via `idb` (durable storage)
- Service Worker (offline + PWA install)

## Getting started

```bash
cd "/Users/Nova/Documents/Projects/Attendance App/skatetrack"
pnpm install
pnpm dev          # dev server at http://localhost:5173
pnpm build        # production build to dist/
pnpm preview      # serve the production build at http://localhost:4173
```

## Install on your phone (PWA)

1. Open the deployed URL in **Safari (iPhone)** or **Chrome (Android)**.
2. iPhone: tap the **Share** button → **Add to Home Screen** → confirm.
3. Android: tap the menu (⋮) → **Install app** → confirm.

The app will appear on your home screen with a 🛹 icon and opens full-screen like a native app.

## Data storage

- **Where:** IndexedDB on your phone (your browser's app-specific sandbox)
- **Survives:** cache clearing, app restarts, OS updates, phone reboots
- **Auto-snapshot:** after every change
- **Manual backup:** Settings → Export backup (JSON file)
- **Restore:** Settings → Import backup (paste JSON)

## Project structure

```
src/
├── data/         # Types, store, IndexedDB persistence, date helpers
├── components/   # UI primitives + MissedAttendanceModal
├── pages/        # HomePage, StudentsPage, BatchesPage, ChartPage, AttendanceFlowPage, SettingsPage, OnboardingPage
├── App.tsx       # Routes + boot
└── main.tsx      # Entry + SW registration
```

## Deploy

The `dist/` folder is a static build. Drop it on any host:

- **GitHub Pages** — free, recommended
- **Netlify / Vercel / Cloudflare Pages** — drag & drop dist/
- **Self-hosted** — `npx serve dist` or any static server

Set up: see DEPLOY.md.
