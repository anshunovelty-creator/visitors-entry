# Visitors Entry: design

**Status: draft, design in progress.** This document records the decisions made during the 2026-10-08 brainstorming session. It is not yet approved for implementation. The sections under "Still to design" are open.

Mockups: [`docs/design/mockups/index.html`](../../design/mockups/index.html). Open it in a browser; no server is needed.

## Purpose

A visitor check-in system for the Novelty Labels office reception. Visitors check themselves in, hosts are emailed when their visitor arrives, and reception always knows who is in the building.

## Decisions

| Topic | Decision |
|---|---|
| Setting | One company, Novelty Labels, at its office front desk. Single-tenant. |
| Surfaces | A desk device (company phone or tablet), visitors' own phones, a staff console (reception, hosts, admins), and host pre-invites with a QR code. |
| Host notification | Email only. |
| v1 extras | Visitor photo. Badge printing and NDA sign-off are out of scope. |
| Stack | Next.js (App Router, TypeScript, Tailwind) on Vercel, with Supabase for Postgres, Auth, Storage, Realtime and row-level security (RLS). |
| Architecture | One app. The desk device is enrolled and can only create check-ins. |
| Own-phone check-in | Opened from a static poster QR or the link in the invite email. The visit waits as **Arriving** until reception confirms it, and the host is emailed after confirmation. |
| Groups | The visitor records how many people are with them and each person's name. The photo is of the main visitor only. |
| Visual direction | "Paper & Ink", designed mobile-first for phones and tablets. |

## Surfaces and roles

- **Desk device** (`/kiosk`): a company phone or tablet at reception. An admin enrolls it once. Check-ins take effect immediately and the host is emailed right away. It can scan invite QR codes with its camera.
- **Visitor's own phone** (`/visit`): a public flow opened from the poster QR or the invite email link. It ends in the Arriving state.
- **Staff console** (`/reception`, `/host`, `/admin`): one app that works on phone and desktop. Sign-in is by email magic link and there is no public sign-up. Each role includes the one before it:
  - **host**: creates invites and sees their own visitors.
  - **reception**: everything a host can do, plus the lobby, the visit log, and checking anyone in or out.
  - **admin**: everything reception can do, plus managing staff and desk devices.
  - Navigation shows only what the person's role allows.
  - A one-off script creates the first admin.

> Presented but not yet explicitly confirmed: the host → reception → admin role ladder, and magic-link login instead of passwords.

## Access model

- **Desk device enrollment:** an admin names the device and gets an 8-character code that is valid for 10 minutes. Entering the code on the device signs it in as a dedicated device account whose session renews indefinitely.
- **Desk device rights:** no direct table access. It can call only narrow database functions:
  - **search hosts**: returns name and department, never email.
  - **check in**: creates a visit stamped with the device.
  - **redeem invite**: takes a code and returns only that invite.
  - **find open visit to sign out**: needs at least 3 letters of the name, covers today only, and returns first name plus last initial.
  - **storage**: insert-only. It can upload a photo but never read one.
- **Revocation:** every function checks the device's status, so revoking a device takes effect on its next request.
- **Own-phone flow:**
  - The flow is public, so its writes go through server code with rate limiting.
  - Photos upload through a signed upload URL that is valid for one path only.
  - The visitor's phone keeps a secret per-visit token, which lets its status page update live and offer sign-out.
- **Staff access:** enforced by RLS in Postgres, so a host can read only their own visitors and invites.

## Data model (draft)

- **`staff`**: id (the auth user), full name, email, department, role (host, reception or admin), active.
- **`kiosk_devices`**: name, auth user, enrollment code hash and its expiry, last_seen_at, revoked_at.
- **`invites`**: host, visitor name, email and company, date, purpose, code, status (pending, used or cancelled). Single-use and valid only on the invite date.
- **`invite_guests`**: invite, full name. Expected guests the host lists in advance.
- **`visits`**:
  - who and why: host, invite (optional), visitor name, company and mobile, purpose, photo path;
  - how: source (desk, own phone or reception), the device or staff member who checked them in;
  - when: status (see lifecycle below), arrived_at, checked_in_at, checked_out_at;
  - the 3-digit check-in code;
  - whether the host email was sent, or the error if it failed.
- **`visit_guests`**: visit, full name, checked_out_at. One row per extra person. This keeps the headcount right when a group leaves at different times.

**Visit lifecycle:**
- Arriving → checked in → checked out.
- Arriving → declined (reception taps "Not here").
- Arriving → expired (nobody confirms within 30 minutes).
- Desk-device and reception check-ins start directly at checked in.

## Flows

### Desk device and own phone (same screens)

1. **Welcome:** three choices: I have an invite, No invite, I'm leaving.
2. **Your details:**
   - full name (required);
   - company;
   - mobile number (optional);
   - **people with you**: defaults to "Just me", and "Add a person" adds a required name field for each extra person;
   - purpose, as chips: Meeting, Interview, Delivery, Contractor, Other.
3. **Who are you visiting?:** search hosts by name. A "Not sure? Pick Reception" option means visitors are never stuck.
4. **Quick photo:** of the main visitor, with an oval face guide and the notice "Only reception and your host can see it. Deleted after 90 days."
5. **Done:**
   - On the desk device: "You're checked in", with a group name list if there is one. The screen returns to the start after 8 seconds.
   - On an own phone: the **Arriving** screen with the 3-digit code ("show this at reception"). It updates by itself to "You're all set" once reception confirms, and offers a **Sign out** button.

### Invites

- **Desk device:** scan the QR, or type the code.
- **Own phone:** the email link pre-fills the code.
- After the code: "Is this you?" → **Anyone with you today?**, pre-filled from the host's guest list and editable → photo → done.

### Sign-out

- **Desk device:** search by name (at least 3 letters, today only, first name plus last initial).
- **Own phone:** the Sign out button on the status page.
- **Groups:** signing out a group signs out everyone still in it.
- **Reception:** can sign out anyone, including a single guest from a group.

### Reception console

- **Stat tiles:** in the building (counted in people), arriving, expected today, signed out today.
- **Arriving strip:** photo, name, group size, host and code, with **Confirm** and **Not here**. "Not here" tells the visitor's phone to speak to reception.
- **In the building:**
  - columns: photo, visitor, host, time in, how they checked in, host-email status, and Sign out;
  - visitors who didn't sign out on a **previous day** are flagged and stay until reception signs them out (nothing signs people out automatically);
  - failed host emails show **Resend**.
- **Expected today:** today's invites, each with a one-click Check in.
- **Live updates** through Supabase Realtime, plus search with the `/` shortcut.
- **On phones:** a bottom tab bar (Lobby, Expected, Log, Invites), a floating Check in button, a visit-details sheet with per-guest sign-out, and a one-screen staff check-in form where the photo is optional.

## Visual design

- **Direction:** Paper & Ink. A light paper background, the brand green used as ink, and the barcode "N" from the logo as an accent.
- **Colors:**
  - brand `#10553F` (hover `#0C4332`), tint `#EAF3EE`;
  - paper `#FAFAF7`, surface `#FFFFFF`;
  - ink `#0E1F18`, secondary text `#4A5B53`, muted text `#6B7A72`;
  - border `#DCE5E0`, input border `#CBD8D1`;
  - warning `#FEF3C7` / `#92400E` (accent `#D97706`), danger `#B42318`.
- **Type:** Saira 600 for headings and buttons (it echoes the squared wordmark) and Inter for body text. Times and counts use tabular numerals.
- **Shape:** inputs 12px radius, buttons 14px, cards and tiles 16px. Icons are Lucide-style SVGs with a 2px stroke, never emoji.
- **Touch:** every target is at least 44px, and primary buttons on visitor screens are 56px.
- **Responsive:** phone-first single column. On a landscape tablet, the heading sits left and the actions right. The staff console uses a sidebar from 1024px wide and a bottom tab bar on phones.
- **Logo:** the Novelty Labels logo, shown in white on dark surfaces.

## Photos, email and privacy

- **Photos:** go from the browser straight to a private Supabase Storage bucket and never pass through Vercel, which caps request size. Staff see them through links that expire after a few minutes, and hosts only for their own visitors. Photos are deleted after **90 days**.
- **Email:** sent through SMTP credentials the company supplies. Supabase Auth needs the same credentials for magic-link emails, because its built-in mailer is for testing only. In local development, emails print to the terminal.

## Still to design

- Host portal: my visitors, my invites, creating an invite with expected guest names.
- Emails: "your visitor has arrived" to the host, and the invitation with its QR code and check-in link to the visitor.
- Admin: staff management, desk device enrollment and revocation.
- Visit log: search, filters, date range.
- Error handling: network failures on the kiosk, camera denied, invalid or expired invites, a revoked device, an email failure. Proposed: the desk device clears and returns to the start after 60 seconds of no touch.
- Testing: unit tests, RLS and security tests against a hosted Supabase dev project (no Docker locally), and Playwright end-to-end tests for the main flows.
- Build order and phases.
