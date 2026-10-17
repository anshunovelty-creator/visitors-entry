-- Phone/desktop push notifications for hosts. One row per browser that turned alerts on; server code
-- only (RLS on, no policies): the app saves rows for the signed-in staff member and reads them to send.

create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and length(endpoint) <= 1000),
  -- A browser moves to whoever signed in on it last, so a shared device doesn't alert the previous user.
  staff_id uuid not null references public.staff on delete cascade,
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index push_subscriptions_staff_idx on public.push_subscriptions (staff_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
