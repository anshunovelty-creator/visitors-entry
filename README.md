# Visitors Entry

Visitor check-in for the Novelty Labels office. Design: [`docs/superpowers/specs/2026-10-08-visitors-entry-design.md`](docs/superpowers/specs/2026-10-08-visitors-entry-design.md).

Next.js 16 + Supabase (Postgres, Auth, Storage, Realtime).

## What works so far

- `/kiosk`: desk-device check-in (invite code, or details + host search), people with you, photo, and sign-out. The host is emailed on check-in.
- `/visit`: the same check-in on the visitor's own phone, from the entrance poster QR or an invite link. Waits as **Arriving** with a 3-digit code until reception confirms; the phone keeps a live status page with a Sign out button.
- `/kiosk/enroll`: signs a desk device in with a one-time 8-character code.
- `/login`: staff sign-in by email and password (no public sign-up).
- `/admin`: add staff with a starting password, change roles, reset passwords, deactivate; add desk devices, issue enrollment codes, revoke devices. `/admin/poster`: printable entrance QR poster.
- `/reception`: live lobby: Arriving (confirm / not here), in the building, expected today (one-click check-in), host-email status with Resend, sign-out of groups or single guests. Hosts see only their own visitors and can't sign anyone out.
- `/reception/invites`: hosts invite visitors for a date, with expected guests; the visitor is emailed a 6-character code and a check-in link.
- `/reception/visit/[id]`: full visit details (large photo, mobile, purpose, host, times, each guest).
- `/reception/log`: every past visit, searchable by visitor, company or host, filtered by date.

Not yet: QR scanning on the desk device (type the code), photo deletion after 90 days, self-service password change.

## Setup

1. Create a Supabase project. In the SQL editor, run each file in `supabase/migrations/` in order.
2. Copy `.env.example` to `.env.local` and fill in the keys from Project Settings → API.
3. Install and create the first admin:

   ```sh
   npm install
   npm run admin -- staff you@noveltylabels.com "Your Name" admin 'a-starting-password'
   npm run admin -- password you@noveltylabels.com 'new-password'   # if you get locked out
   ```

4. Email (optional locally, needed in production): create a [Resend](https://resend.com) API key and set `RESEND_API_KEY`, plus `EMAIL_FROM` once your domain is verified there. Without a key, emails print to the terminal in development and show as failed (with Resend) in production.
5. `npm run dev`, sign in at `/login`, then add staff and desk devices at `/admin`. Open `/kiosk/enroll` on the desk device and enter its code.

## Checks

```sh
npm run lint
npm test          # visit-log search and date filters
npm run test:db   # migration + access rules on an in-memory Postgres
npm run test:live # end-to-end against the Supabase project in .env.local (cleans up after itself)
npm run build
```
