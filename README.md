# Visitors Entry

Visitor check-in for the Novelty Labels office. Design: [`docs/superpowers/specs/2026-10-08-visitors-entry-design.md`](docs/superpowers/specs/2026-10-08-visitors-entry-design.md).

Next.js 16 + Supabase (Postgres, Auth, Storage, Realtime).

## What works so far

- `/kiosk`: desk-device check-in (scan the invite QR or type its code, or details + host search), people with you, photo, and sign-out. The host is emailed on check-in to approve the visit.
- `/visit`: the same check-in on the visitor's own phone, from the entrance poster QR or an invite link. Waits as **Arriving** with a 3-digit code until reception confirms; the phone keeps a live status page with a Sign out button.
- `/kiosk/enroll`: signs a desk device in with a one-time 8-character code.
- `/login`: staff sign-in by email and password (no public sign-up).
- `/admin`: add staff with a starting password, change roles, reset passwords, deactivate; add desk devices, issue enrollment codes, revoke devices. `/admin/poster`: printable entrance QR poster.
- `/reception`: live lobby: Arriving (confirm / not here), in the building, expected today (one-click check-in), host-email status with Resend (send again), sign-out of groups or single guests. Hosts see only their own visitors and can't sign anyone out.
- `/reception/check-in`: reception checks in a walk-in without an invite (host, people with them, optional photo); the host is emailed.
- `/reception/invites`: hosts invite visitors for a date, with expected guests; the visitor is emailed a 6-character code, a QR for the desk tablet, and a check-in link.
- Host approval before entry: a checked-in visitor waits in **Waiting for the host** until the host taps **Approve** or **Decline** in the arrival email (signed `/respond/…` link, no sign-in), in the app, or in the pop-up that appears on any staff page they have open (plus a system notification on desktop browsers; tap the bell to allow it). Approved visitors move to **In the building**; reception can **Let in anyway** if the host doesn't answer. A visitor on their own phone sees *Please wait* → *You can go in* (or *Please speak to reception*).
- `/reception/visit/[id]`: full visit details (large photo, mobile, purpose, host, times, each guest).
- `/reception/log`: every past visit, searchable by visitor, company or host, filtered by date.

- Lobby search (`/` to focus), and a bottom tab bar with a floating Check in button on phones.
- Watchlist (admins): matching visitors are held as Arriving for reception. `/reception/roll-call`: emergency roll call. `/admin/audit`: who changed what.
- Gate details: vehicle number and what the visitor is carrying, on every check-in (desk, phone, reception), the visit page, badge and CSV export.
- Visitor agreement: admins set NDA / safety text at `/admin`; desk and phone check-ins must accept it (reception ticks it for walk-ins), and each visit records the version accepted.
- Badges: `/reception/visit/[id]/badge` prints a 4×3 in visitor badge (photo, host, date, vehicle, QR). Scanning the QR at the desk's "Signing out" screen signs the visit out.
- `/reception/deliveries`: reception logs courier parcels; the recipient is emailed and pushed, and marks it collected.
- Invites carry a calendar file (.ics) and the admin's visitor info (address, parking, Wi-Fi).
- Host reminders after 5 minutes without an answer, returning-visitor autofill by mobile (desk and reception), `/reception/reports` with CSV export, overstay flags and a nightly sign-out (`/api/cron/sign-out`), and push notifications to staff phones (VAPID keys in `.env.example`).
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

4. Email (optional locally, needed in production): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and optionally `EMAIL_FROM`); see `.env.example` for Gmail. Without `SMTP_HOST`, emails print to the terminal in development and show as failed (with Resend) in production.
5. `npm run dev`, sign in at `/login`, then add staff and desk devices at `/admin`. Open `/kiosk/enroll` on the desk device and enter its code.
6. Deploying (Vercel): set the same Supabase keys, the `SMTP_*` variables and `EMAIL_FROM`, and a random `CRON_SECRET` (`openssl rand -hex 32`) for the photo purge. Every new file in `supabase/migrations/` must also be run on the hosted project; the app sends staff back to `/login` if a column it expects is missing.

## Checks

```sh
npm run lint
npm test          # log filters, invite-QR parsing and decoding, signed host links
npm run test:db   # migration + access rules on an in-memory Postgres
npm run test:live # end-to-end against the Supabase project in .env.local (cleans up after itself)
npm run build
```
