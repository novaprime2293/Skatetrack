# Deploying Skatetrack

Skatetrack is a static PWA. The `dist/` folder is everything you need.

## Quickest path: GitHub Pages

```bash
# 1. Create a new repo on GitHub at github.com/yourname/skatetrack
# 2. Push the dist folder to the gh-pages branch:
cd "/Users/Nova/Documents/Projects/Attendance App/skatetrack"
pnpm run build
npx gh-pages -d dist
```

Then your app lives at `https://yourname.github.io/skatetrack/`.

## Important: Hash routes

The app uses **HashRouter** (`#/`, `#/students`, etc.) so it works on any static host without server-side routing config. You can host this on GitHub Pages, S3, Netlify, anything — no fallback rewrites needed.

## Custom domain

Drop a `CNAME` file inside `public/` with your domain, then `pnpm run build`. Configure DNS at your registrar.

## What gets cached

The service worker caches everything in `dist/` on first visit. After that:
- Works offline forever
- Updates deploy when the SW detects a new version (refresh the page once)

## Settings after deploy

The app is **single-user** and **local-only**. No accounts, no cloud sync. Each device has its own data. To move data between devices:

1. Open the app on the **source** device
2. Settings → Download backup
3. Email / AirDrop / WhatsApp the JSON file to yourself
4. Open the app on the **target** device
5. Settings → Import backup → paste the JSON

## What's NOT in v1 (parked for v1.1)

- Push notifications for missed attendance
- Photo on student profile
- Multi-teacher / multi-org
- Email/SMS notifications to parents
- Web push (works offline only)

See the original PRD for the full roadmap.
