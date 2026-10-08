# Visitors Entry

Visitor check-in for the Novelty Labels office. Design: [`docs/superpowers/specs/2026-10-08-visitors-entry-design.md`](docs/superpowers/specs/2026-10-08-visitors-entry-design.md).

Next.js 16 + Supabase (Postgres, Auth, Storage, Realtime).

## What works so far

- `/kiosk`: desk-device check-in (details, people with you, host search, photo) and sign-out.
- `/kiosk/enroll`: signs a desk device in with a one-time 8-character code.
- `/login`: staff sign-in by email and password (no public sign-up).
- `/admin`: add staff with a starting password, change roles, reset passwords, deactivate; add desk devices, issue enrollment codes, revoke devices.
- `/reception`: live lobby with headcount, photos, and sign-out of whole groups or single guests. Hosts see only their own visitors and can't sign anyone out.
- `/reception/visit/[id]`: full visit details (large photo, mobile, purpose, host, times, each guest).
- `/reception/log`: every past visit, searchable by visitor, company or host, filtered by date.

Not yet: invites, own-phone check-in, host emails, self-service password change.

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/20261008000000_init.sql`.
2. Copy `.env.example` to `.env.local` and fill in the keys from Project Settings → API.
3. Install and create the first admin:

   ```sh
   npm install
   npm run admin -- staff you@noveltylabels.com "Your Name" admin 'a-starting-password'
   npm run admin -- password you@noveltylabels.com 'new-password'   # if you get locked out
   ```

4. `npm run dev`, sign in at `/login`, then add staff and desk devices at `/admin`. Open `/kiosk/enroll` on the desk device and enter its code.

## Checks

```sh
npm run lint
npm test          # visit-log search and date filters
npm run test:db   # migration + access rules on an in-memory Postgres
npm run build
```
