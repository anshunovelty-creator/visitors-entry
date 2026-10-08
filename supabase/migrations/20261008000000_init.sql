-- Visitors Entry: initial schema.
-- Run against a hosted Supabase project (SQL editor or `supabase db push`).

-- ---------------------------------------------------------------- types

create type public.staff_role as enum ('host', 'reception', 'admin');
create type public.visit_status as enum ('arriving', 'checked_in', 'checked_out', 'declined', 'expired');
create type public.visit_source as enum ('desk', 'own_phone', 'reception');
create type public.invite_status as enum ('pending', 'used', 'cancelled');

-- ---------------------------------------------------------------- tables

create table public.staff (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null unique,
  department text,
  role public.staff_role not null default 'host',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid unique references auth.users on delete set null,
  enrollment_code_hash text unique,
  enrollment_expires_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.staff on delete cascade,
  visitor_name text not null,
  visitor_email text,
  visitor_company text,
  visit_date date not null,
  purpose text,
  code text not null unique,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.invite_guests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites on delete cascade,
  full_name text not null
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  -- null host = "Not sure? Pick Reception"
  host_id uuid references public.staff on delete set null,
  invite_id uuid references public.invites on delete set null,
  visitor_name text not null check (length(trim(visitor_name)) > 0),
  company text,
  mobile text,
  purpose text,
  photo_path text,
  source public.visit_source not null,
  device_id uuid references public.kiosk_devices on delete set null,
  checked_in_by uuid references public.staff on delete set null,
  status public.visit_status not null,
  arrived_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  code char(3),
  host_email_sent_at timestamptz,
  host_email_error text,
  created_at timestamptz not null default now()
);

create index visits_status_idx on public.visits (status, checked_in_at);
create index visits_host_idx on public.visits (host_id);

create table public.visit_guests (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  checked_out_at timestamptz
);

create index visit_guests_visit_idx on public.visit_guests (visit_id);

-- ---------------------------------------------------------------- helpers

-- ponytail: office time zone hard-coded; make it a setting if a second office appears.
create function public.office_day_start() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata'
$$;

create function public.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select role from public.staff where id = auth.uid() and active
$$;

create function public.is_reception() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_staff_role() in ('reception', 'admin'), false)
$$;

create function public.is_active_device() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kiosk_devices where user_id = auth.uid() and revoked_at is null)
$$;

-- Every kiosk function calls this first, so revoking a device takes effect on its next request.
create function public.kiosk_device() returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare d uuid;
begin
  update public.kiosk_devices set last_seen_at = now()
   where user_id = auth.uid() and revoked_at is null
  returning id into d;
  if d is null then
    raise exception 'device not enrolled or revoked' using errcode = '42501';
  end if;
  return d;
end $$;

-- "Priya Sharma" -> "Priya S."
create function public.short_name(full_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when position(' ' in trim(full_name)) = 0 then trim(full_name)
    else split_part(trim(full_name), ' ', 1) || ' ' ||
         left(regexp_replace(trim(full_name), '^.* ', ''), 1) || '.'
  end
$$;

-- ---------------------------------------------------------------- kiosk functions

create function public.kiosk_whoami() returns table (device_id uuid, device_name text)
language plpgsql security definer set search_path = '' as $$
declare d uuid := public.kiosk_device();
begin
  return query select k.id, k.name from public.kiosk_devices k where k.id = d;
end $$;

-- Name and department only, never email.
create function public.kiosk_search_hosts(q text)
returns table (id uuid, full_name text, department text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kiosk_device();
  if length(trim(coalesce(q, ''))) < 1 then return; end if;
  return query
    select s.id, s.full_name, s.department from public.staff s
     where s.active
       and (s.full_name ilike trim(q) || '%' or s.full_name ilike '% ' || trim(q) || '%')
     order by s.full_name
     limit 8;
end $$;

create function public.kiosk_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text)
language plpgsql security definer set search_path = '' as $$
declare
  d uuid := public.kiosk_device();
  v uuid;
  t timestamptz := now();
begin
  if length(trim(coalesce(p_visitor_name, ''))) = 0 then
    raise exception 'visitor name is required' using errcode = '22023';
  end if;
  if p_host_id is not null and not exists (select 1 from public.staff where id = p_host_id and active) then
    raise exception 'unknown host' using errcode = '22023';
  end if;
  if p_photo_path is not null and p_photo_path !~ '^desk/[0-9a-f-]{36}\.jpg$' then
    raise exception 'bad photo path' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_guests, '{}')) g where length(trim(g)) = 0) then
    raise exception 'every guest needs a name' using errcode = '22023';
  end if;

  insert into public.visits (host_id, visitor_name, company, mobile, purpose, photo_path,
                             source, device_id, status, arrived_at, checked_in_at)
  values (p_host_id, trim(p_visitor_name), nullif(trim(p_company), ''), nullif(trim(p_mobile), ''),
          nullif(trim(p_purpose), ''), p_photo_path, 'desk', d, 'checked_in', t, t)
  returning id into v;

  insert into public.visit_guests (visit_id, full_name)
  select v, trim(g) from unnest(coalesce(p_guests, '{}')) g;

  return query
    select v, t, s.full_name, s.department
      from (select 1) x left join public.staff s on s.id = p_host_id;
end $$;

-- At least 3 letters, today only, first name plus last initial.
create function public.kiosk_find_open_visits(q text)
returns table (visit_id uuid, visitor text, checked_in_at timestamptz, host text, guests int)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kiosk_device();
  if length(trim(coalesce(q, ''))) < 3 then return; end if;
  return query
    select v.id, public.short_name(v.visitor_name), v.checked_in_at,
           coalesce(public.short_name(s.full_name), 'Reception'),
           (select count(*)::int from public.visit_guests g where g.visit_id = v.id and g.checked_out_at is null)
      from public.visits v left join public.staff s on s.id = v.host_id
     where v.status = 'checked_in'
       and v.checked_in_at >= public.office_day_start()
       and (v.visitor_name ilike trim(q) || '%' or v.visitor_name ilike '% ' || trim(q) || '%')
     order by v.checked_in_at desc
     limit 8;
end $$;

-- Signs out the visitor and everyone still in their group.
create function public.kiosk_sign_out(p_visit_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.kiosk_device();
  update public.visits set status = 'checked_out', checked_out_at = now()
   where id = p_visit_id and status = 'checked_in' and checked_in_at >= public.office_day_start();
  get diagnostics n = row_count;
  if n = 1 then
    update public.visit_guests set checked_out_at = now()
     where visit_id = p_visit_id and checked_out_at is null;
  end if;
  return n = 1;
end $$;

revoke execute on function
  public.kiosk_device(), public.kiosk_whoami(), public.kiosk_search_hosts(text),
  public.kiosk_check_in(text, text, text, text, uuid, text[], text),
  public.kiosk_find_open_visits(text), public.kiosk_sign_out(uuid)
from public, anon;
grant execute on function
  public.kiosk_whoami(), public.kiosk_search_hosts(text),
  public.kiosk_check_in(text, text, text, text, uuid, text[], text),
  public.kiosk_find_open_visits(text), public.kiosk_sign_out(uuid)
to authenticated;

-- ---------------------------------------------------------------- staff functions

-- Reception signs out a whole visit, or one guest when p_guest_id is given.
create function public.staff_sign_out(p_visit_id uuid, p_guest_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_reception() then
    raise exception 'reception only' using errcode = '42501';
  end if;
  if p_guest_id is not null then
    update public.visit_guests set checked_out_at = now()
     where id = p_guest_id and visit_id = p_visit_id and checked_out_at is null;
    return;
  end if;
  update public.visits set status = 'checked_out', checked_out_at = now()
   where id = p_visit_id and status = 'checked_in';
  update public.visit_guests set checked_out_at = now()
   where visit_id = p_visit_id and checked_out_at is null;
end $$;

revoke execute on function public.staff_sign_out(uuid, uuid) from public, anon;
grant execute on function public.staff_sign_out(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.staff enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.invites enable row level security;
alter table public.invite_guests enable row level security;
alter table public.visits enable row level security;
alter table public.visit_guests enable row level security;

-- Staff: any active staff member can see the directory; admins manage it.
create policy staff_read on public.staff for select to authenticated
  using (public.current_staff_role() is not null);
create policy staff_admin on public.staff for all to authenticated
  using (public.current_staff_role() = 'admin') with check (public.current_staff_role() = 'admin');

-- Desk devices: admins only. Devices themselves go through the kiosk_* functions.
create policy kiosk_devices_admin on public.kiosk_devices for all to authenticated
  using (public.current_staff_role() = 'admin') with check (public.current_staff_role() = 'admin');

-- Invites: hosts see and manage their own; reception sees all.
create policy invites_read on public.invites for select to authenticated
  using (host_id = auth.uid() or public.is_reception());
create policy invites_insert on public.invites for insert to authenticated
  with check (host_id = auth.uid() and public.current_staff_role() is not null);
create policy invites_update on public.invites for update to authenticated
  using (host_id = auth.uid() or public.is_reception());

create policy invite_guests_read on public.invite_guests for select to authenticated
  using (exists (select 1 from public.invites i where i.id = invite_id));
create policy invite_guests_write on public.invite_guests for all to authenticated
  using (exists (select 1 from public.invites i where i.id = invite_id and (i.host_id = auth.uid() or public.is_reception())))
  with check (exists (select 1 from public.invites i where i.id = invite_id and (i.host_id = auth.uid() or public.is_reception())));

-- Visits: hosts see their own visitors; reception sees and changes everything.
create policy visits_read on public.visits for select to authenticated
  using (host_id = auth.uid() or public.is_reception());
create policy visits_reception on public.visits for all to authenticated
  using (public.is_reception()) with check (public.is_reception());

create policy visit_guests_read on public.visit_guests for select to authenticated
  using (exists (select 1 from public.visits v where v.id = visit_id));
create policy visit_guests_reception on public.visit_guests for all to authenticated
  using (public.is_reception()) with check (public.is_reception());

-- ---------------------------------------------------------------- photos

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-photos', 'visit-photos', false, 5242880, array['image/jpeg']);

-- Desk devices may upload under desk/ but never read.
create policy photos_device_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[1] = 'desk'
    and public.is_active_device()
  );

-- Reception sees every photo; hosts only their own visitors'.
create policy photos_staff_read on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and (public.is_reception()
         or exists (select 1 from public.visits v where v.photo_path = name and v.host_id = auth.uid()))
  );

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.visits, public.visit_guests;
