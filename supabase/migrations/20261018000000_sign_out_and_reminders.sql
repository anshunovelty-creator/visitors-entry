-- End-of-day sign-out, and one reminder to a host who hasn't approved their visitor.

alter table public.visits
  -- Closed overnight by auto_sign_out(), not by a real sign-out: the log says so instead of
  -- pretending they left at midnight.
  add column auto_signed_out boolean not null default false,
  -- Set when the host is reminded, so it happens once. Reception's screen claims it (RLS: reception).
  add column host_reminded_at timestamptz;

-- Visitors still checked in from an earlier office day are signed out, with their guests, so the
-- next day's lobby and roll call start clean. Vercel Cron calls it nightly through server code.
create function public.auto_sign_out() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with closed as (
    update public.visits set status = 'checked_out', checked_out_at = now(), auto_signed_out = true
     where status = 'checked_in' and checked_in_at < public.office_day_start()
     returning id
  ), guests as (
    update public.visit_guests g set checked_out_at = now()
      from closed where g.visit_id = closed.id and g.checked_out_at is null
  )
  select count(*)::int into n from closed;
  return n;
end $$;

revoke execute on function public.auto_sign_out() from public, anon, authenticated;
grant execute on function public.auto_sign_out() to service_role;
