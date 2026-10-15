-- Fixed-window counters for the public own-phone flow. Vercel runs many instances, so the count
-- has to live somewhere shared; Postgres is already here.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);
-- No policies: only the service role (server code) touches it.
alter table public.rate_limits enable row level security;

-- Counts one hit for p_key in the current window; true while the count is within p_max.
create function public.rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits as r (key, window_start) values (p_key, w)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- ponytail: sweeps old windows on ~1% of calls; move to the daily cron if this table ever gets hot.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end $$;

revoke execute on function public.rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit(text, int, int) to service_role;
