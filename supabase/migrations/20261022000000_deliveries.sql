-- Courier and package drop-offs: reception logs a parcel for a staff member, who is emailed and
-- pushed, and it's marked collected when picked up.

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.staff on delete cascade,
  carrier text check (length(carrier) <= 60),
  description text check (length(description) <= 200),
  tracking text check (length(tracking) <= 60),
  received_by uuid default auth.uid() references public.staff on delete set null,
  received_at timestamptz not null default now(),
  collected_at timestamptz,
  collected_by uuid references public.staff on delete set null
);
create index deliveries_waiting_idx on public.deliveries (recipient_id) where collected_at is null;

alter table public.deliveries enable row level security;
-- Reception sees and logs everything; staff see their own parcels.
create policy deliveries_read on public.deliveries for select to authenticated
  using (public.is_reception() or recipient_id = auth.uid());
create policy deliveries_reception on public.deliveries for all to authenticated
  using (public.is_reception()) with check (public.is_reception());

-- The recipient (or reception) marks a parcel collected; nothing else about it can change that way.
create function public.collect_delivery(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.deliveries set collected_at = now(), collected_by = auth.uid()
   where id = p_id and collected_at is null and (recipient_id = auth.uid() or public.is_reception());
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.collect_delivery(uuid) from public, anon;
grant execute on function public.collect_delivery(uuid) to authenticated;

create trigger audit after insert or update or delete on public.deliveries for each row execute function public.audit();
alter publication supabase_realtime add table public.deliveries;
