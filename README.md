# Visitors Entry

Visitor check-in for the Novelty Labels office. Design: [`docs/superpowers/specs/2026-10-08-visitors-entry-design.md`](docs/superpowers/specs/2026-10-08-visitors-entry-design.md).

Next.js 16 + Supabase (Postgres, Auth, Storage, Realtime).

## What works so far

- `/kiosk`: desk-device check-in (scan the invite QR or type its code, or details + host search), people with you, photo, and sign-out. The host is emailed on check-in.
- `/visit`: the same check-in on the visitor's own phone, from the entrance poster QR or an invite link. Waits as **Arriving** with a 3-digit code until reception confirms; the phone keeps a live status page with a Sign out button.
- `/kiosk/enroll`: signs a desk device in with a one-time 8-character code.
- `/login`: staff sign-in by email and password (no public sign-up).
- `/admin`: add staff with a starting password, change roles, reset passwords, deactivate; add desk devices, issue enrollment codes, revoke devices. `/admin/poster`: printable entrance QR poster.
- `/reception`: live lobby: Arriving (confirm / not here), in the building, expected today (one-click check-in), host-email status with Resend, sign-out of groups or single guests. Hosts see only their own visitors and can't sign anyone out.
- `/reception/check-in`: reception checks in a walk-in without an invite (host, people with them, optional photo); the host is emailed.
- `/reception/invites`: hosts invite visitors for a date, with expected guests; the visitor is emailed a 6-character code, a QR for the desk tablet, and a check-in link.
- Host approval: the host answers **I'm coming down** / **Not available** from the arrival email (signed `/respond/…` link, no sign-in) or in the app. Reception sees the answer live; a visitor checked in on their phone sees it too.
- `/reception/visit/[id]`: full visit details (large photo, mobile, purpose, host, times, each guest).
- `/reception/log`: every past visit, searchable by visitor, company or host, filtered by date.

- Lobby search (`/` to focus), and a bottom tab bar with a floating Check in button on phones.
- Watchlist (admins): matching visitors are held as Arriving for reception. `/reception/roll-call`: emergency roll call. `/admin/audit`: who changed what.
- `/account`: change your password; staff given a password by an admin must replace it on first sign-in.
- Visit photos are deleted after 90 days by a daily Vercel Cron (`/api/cron/purge-photos`, needs `CRON_SECRET`).
- The public `/visit` flow is rate limited per IP (and invite-code lookups overall) in Postgres.

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
6. Deploying (Vercel): set the same Supabase keys, `RESEND_API_KEY` and `EMAIL_FROM`, and a random `CRON_SECRET` (`openssl rand -hex 32`) for the photo purge. Every new file in `supabase/migrations/` must also be run on the hosted project; the app sends staff back to `/login` if a column it expects is missing.

## Checks

```sh
npm run lint
npm test          # log filters, invite-QR parsing and decoding, signed host links
npm run test:db   # migration + access rules on an in-memory Postgres
npm run test:live # end-to-end against the Supabase project in .env.local (cleans up after itself)
npm run build
```
