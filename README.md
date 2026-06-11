# NestLoop

NestLoop is a family-friendly home hub for shared bills, payment proofs, rotating tasks, and laundry slots.

## What Works Now

- Mobile-first interface with bottom navigation.
- Demo household profiles.
- Shared expenses with equal or custom split.
- Receipt and payment proof file pickers.
- Cash payments wait for receiver confirmation.
- Transfer payments become confirmed after proof is attached.
- Rotating tasks for water, trash, and plants.
- Laundry schedule with quick slot creation.
- PWA manifest and service worker.
- Supabase schema and Vercel setup guide.

## Run Locally

After opening a fresh terminal:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

In this Codex session, if `npm run dev` uses the blocked internal Node, run:

```powershell
& "C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" dev --hostname 127.0.0.1 --port 3000
```

## Build Check

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

## Cloud Setup

Use:

- `docs/supabase-schema.sql`
- `docs/vercel-supabase-setup.md`
- `.env.example`

The app currently runs in demo/local-storage mode until Supabase keys are added.
