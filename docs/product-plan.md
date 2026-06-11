# NestLoop Product Plan

NestLoop is a family home hub for shared expenses, payment proofs, rotating tasks, and schedule ownership.

## Version 1

- Mobile-first app shell with large touch targets.
- Person switcher for demo and future profile context.
- Expense creation with receipt name, payer, participants, and equal or custom split.
- Payment status per person: pending, sent, confirmed, rejected.
- Transfer payments can include proof and become confirmed immediately in this prototype.
- Cash payments wait for the receiver to confirm.
- Rotating tasks such as water, trash, and plant care.
- Laundry schedule grid with quick slot creation.
- People view with balances and member roles.
- PWA manifest and service worker for installable phone experience.

## Version 2

- Supabase authentication.
- Real database persistence.
- Receipt and payment proof uploads to Supabase Storage.
- Household invite links.
- Push or email notifications.
- Monthly summaries and export.

## Suggested Live Stack

- Next.js app on Vercel.
- Supabase Auth for users.
- Supabase Postgres for data.
- Supabase Storage for receipts and proofs.
