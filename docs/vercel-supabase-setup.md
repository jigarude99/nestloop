# NestLoop Deployment Guide

This file is the checklist we will use when you are ready to connect real accounts.

## 1. Supabase

1. Create a new project in Supabase.
2. Open SQL Editor.
3. Run `docs/supabase-schema.sql`.
4. Create two private storage buckets:
   - `receipts`
   - `payment-proofs`
5. Copy:
   - Project URL
   - Anon public key

## 2. Local Env

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 3. GitHub

1. Create a GitHub repository.
2. Push this folder to that repository.

## 4. Vercel

1. Import the GitHub repository in Vercel.
2. Add the same two environment variables.
3. Deploy.

## 5. Family Rollout

1. Add each family member as a Supabase Auth user.
2. Add their profile and household membership.
3. Send the Vercel link.
4. On each phone, use Add to Home Screen.
