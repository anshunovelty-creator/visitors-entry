-- Gate-entry details (vehicle, what the visitor is carrying) and a visitor agreement (NDA / safety
-- rules) accepted at check-in. Plus one settings row for admin-editable text.

-- ---------------------------------------------------------------- settings (one row)

create table public.settings (
  id uuid primary key default gen_random_uuid(), -- a uuid so the audit log can record changes
  -- Shown at check-in on the desk and phones; the visitor must accept it. Empty = no agreement step.
  agreement text not null default '' check (length(agreement) <= 5000),
  -- Bumped whenever the agreement text changes; each visit records the version it accepted.
  agreement_updated_at timestamptz,
  -- Directions, parking, Wi-Fi: added to invite emails.
  visitor_info text not null default '' check (length(visitor_info) <= 2000)
);
create unique index settings_one_row on public.settings ((true));
insert into public.settings default values;

create function public.settings_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.agreement is distinct from old.agreement then new.agreement_updated_at := now(); end if;
  return new;
end $$;
create trigger settings_touch before update on public.settings for each row execute function public.settings_touch();
create trigger audit after update on public.settings for each row execute function public.audit();

alter table public.settings enable row level security;
-- Staff and desk devices read it; only admins change it (no inserts or deletes: it's one row).
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for update to authenticated
  using (public.current_staff_role() = 'admin') with check (public.current_staff_role() = 'admin');
revoke insert, delete on public.settings from anon, authenticated;

-- ---------------------------------------------------------------- visit details

alter table public.visits
  add column vehicle_no text check (length(vehicle_no) <= 20),
  add column carrying text check (length(carrying) <= 200),
  add column agreed_at timestamptz,
  add column agreement_version timestamptz;

-- create_visit gains vehicle, carrying and the agreement. Desk and phone check-ins must accept the
-- current agreement when there is one; reception records it when they tick it for the visitor.
drop function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid);
drop function public.staff_check_in(text, text, text, text, uuid, text[], text);
drop function public.create_visit(public.visit_source, uuid, text, text, text, text, uuid, text[], text, uuid, text, text);

create function public.create_visit(
  p_source public.visit_source,
  p_device uuid,
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text,
  p_invite_id uuid default null,
  p_phone_token_hash text default null,
  p_origin_hash text default null,
  p_vehicle text default null,
  p_carrying text default null,
  p_agreed boolean default false
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text, status public.visit_status, code char(3))
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
  t timestamptz := now();
  st public.visit_status := case when p_source = 'own_phone' then 'arriving' else 'checked_in' end;
  c char(3) := case when p_source = 'own_phone' then (100 + floor(random() * 900))::int::text end;
  h uuid := p_host_id;
  wl uuid;
  ag record;
begin
  if length(trim(coalesce(p_visitor_name, ''))) = 0 then
    raise exception 'visitor name is required' using errcode = '22023';
  end if;
  if length(p_visitor_name) > 120 or length(coalesce(p_company, '')) > 120 or length(coalesce(p_mobile, '')) > 30
     or length(coalesce(p_purpose, '')) > 60 or coalesce(array_length(p_guests, 1), 0) > 20
     or length(coalesce(p_vehicle, '')) > 20 or length(coalesce(p_carrying, '')) > 200 then
    raise exception 'input too long' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_guests, '{}')) g where length(trim(g)) = 0 or length(g) > 120) then
    raise exception 'every guest needs a name' using errcode = '22023';
  end if;
  if p_photo_path is not null and p_photo_path !~ (
       '^' || case p_source when 'desk' then 'desk' when 'own_phone' then 'phone' else 'staff' end || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'bad photo path' using errcode = '22023';
  end if;

  select s.agreement, s.agreement_updated_at into ag from public.settings s limit 1;
  if p_source <> 'reception' and length(trim(coalesce(ag.agreement, ''))) > 0 and not coalesce(p_agreed, false) then
    raise exception 'agreement not accepted' using errcode = '22023';
  end if;

  if p_invite_id is not null then
    -- Single use: claim the invite before creating the visit. The invite decides the host.
    update public.invites i set status = 'used'
     where i.id = p_invite_id and i.status = 'pending' and i.visit_date = public.office_today()
    returning i.host_id into h;
    if h is null then
      raise exception 'invite not valid today' using errcode = '22023';
    end if;
  end if;
  if h is not null and not exists (select 1 from public.staff where id = h and active) then
    raise exception 'unknown host' using errcode = '22023';
  end if;

  -- Reception checking someone in is already looking at them; everyone else is screened.
  if p_source <> 'reception' then
    select w.id into wl from public.watchlist w
     where (length(public.norm_name(w.full_name)) > 0 and (
              public.norm_name(w.full_name) = public.norm_name(p_visitor_name)
              or exists (select 1 from unnest(coalesce(p_guests, '{}')) g where public.norm_name(g) = public.norm_name(w.full_name))))
        or (length(public.norm_mobile(w.mobile)) >= 8 and public.norm_mobile(w.mobile) = public.norm_mobile(p_mobile))
     limit 1;
    if wl is not null then
      st := 'arriving';
      c := coalesce(c, (100 + floor(random() * 900))::int::text);
    end if;
  end if;

  insert into public.visits (host_id, invite_id, visitor_name, company, mobile, purpose, photo_path, source,
                             device_id, checked_in_by, status, arrived_at, checked_in_at, code,
                             phone_token_hash, origin_hash, watchlist_id, vehicle_no, carrying,
                             agreed_at, agreement_version)
  values (h, p_invite_id, trim(p_visitor_name), nullif(trim(p_company), ''), nullif(trim(p_mobile), ''),
          nullif(trim(p_purpose), ''), p_photo_path, p_source, p_device,
          case when p_source = 'reception' then auth.uid() end,
          st, t, case when st = 'checked_in' then t end, c, p_phone_token_hash, p_origin_hash, wl,
          nullif(upper(regexp_replace(trim(coalesce(p_vehicle, '')), '\s+', ' ', 'g')), ''), nullif(trim(p_carrying), ''),
          case when coalesce(p_agreed, false) and length(trim(coalesce(ag.agreement, ''))) > 0 then t end,
          case when coalesce(p_agreed, false) and length(trim(coalesce(ag.agreement, ''))) > 0 then ag.agreement_updated_at end)
  returning id into v;

  insert into public.visit_guests (visit_id, full_name)
  select v, trim(g) from unnest(coalesce(p_guests, '{}')) g;

  return query
    select v, t, s.full_name, s.department, st, c
      from (select 1) x left join public.staff s on s.id = h;
end $$;

revoke execute on function public.create_visit(public.visit_source, uuid, text, text, text, text, uuid, text[], text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_visit(public.visit_source, uuid, text, text, text, text, uuid, text[], text, uuid, text, text, text, text, boolean) to service_role;

create function public.kiosk_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text,
  p_invite_id uuid default null,
  p_vehicle text default null,
  p_carrying text default null,
  p_agreed boolean default false
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text, held boolean)
language plpgsql security definer set search_path = '' as $$
declare d uuid := public.kiosk_device();
begin
  return query
    select r.visit_id, r.checked_in_at, r.host_name, r.host_department, r.status = 'arriving'
      from public.create_visit('desk', d, p_visitor_name, p_company, p_mobile, p_purpose,
                               p_host_id, p_guests, p_photo_path, p_invite_id, null, null,
                               p_vehicle, p_carrying, p_agreed) r;
end $$;

revoke execute on function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid, text, text, boolean) from public, anon;
grant execute on function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid, text, text, boolean) to authenticated;

create function public.staff_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text,
  p_vehicle text default null,
  p_carrying text default null,
  p_agreed boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.is_reception() then
    raise exception 'reception only' using errcode = '42501';
  end if;
  select r.visit_id into v
    from public.create_visit('reception', null, p_visitor_name, p_company, p_mobile, p_purpose,
                             p_host_id, p_guests, p_photo_path, null, null, null,
                             p_vehicle, p_carrying, p_agreed) r;
  return v;
end $$;

revoke execute on function public.staff_check_in(text, text, text, text, uuid, text[], text, text, text, boolean) from public, anon;
grant execute on function public.staff_check_in(text, text, text, text, uuid, text[], text, text, text, boolean) to authenticated;
