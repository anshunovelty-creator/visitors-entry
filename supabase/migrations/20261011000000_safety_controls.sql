-- Watchlist, emergency roll call, audit log, and first-sign-in password change.

-- ---------------------------------------------------------------- staff

-- Set when an admin gives someone a password; they must replace it before using the app.
alter table public.staff add column must_change_password boolean not null default false;

-- ---------------------------------------------------------------- watchlist

create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  mobile text,
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.staff on delete set null,
  created_at timestamptz not null default now(),
  check (length(trim(coalesce(full_name, ''))) > 0 or length(trim(coalesce(mobile, ''))) > 0)
);

alter table public.watchlist enable row level security;
-- Reception sees the reason next to a held visitor; only admins add or remove entries.
create policy watchlist_read on public.watchlist for select to authenticated using (public.is_reception());
create policy watchlist_admin on public.watchlist for all to authenticated
  using (public.current_staff_role() = 'admin') with check (public.current_staff_role() = 'admin');

create function public.norm_name(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

-- Last 10 digits, so "+91 98765 43210" and "09876543210" match.
create function public.norm_mobile(t text) returns text
language sql immutable set search_path = '' as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10)
$$;

alter table public.visits add column watchlist_id uuid references public.watchlist on delete set null;

-- Same signature and result as before; now a watchlist match (visitor, mobile, or anyone in the
-- group) holds the visit as Arriving for reception, from the desk or a phone alike.
create or replace function public.create_visit(
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
  p_origin_hash text default null
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text, status public.visit_status, code char(3))
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
  t timestamptz := now();
  st public.visit_status := case when p_source = 'own_phone' then 'arriving' else 'checked_in' end;
  c char(3) := case when p_source = 'own_phone' then (100 + floor(random() * 900))::int::text end;
  h uuid := p_host_id;
  wl uuid;
begin
  if length(trim(coalesce(p_visitor_name, ''))) = 0 then
    raise exception 'visitor name is required' using errcode = '22023';
  end if;
  if length(p_visitor_name) > 120 or length(coalesce(p_company, '')) > 120 or length(coalesce(p_mobile, '')) > 30
     or length(coalesce(p_purpose, '')) > 60 or coalesce(array_length(p_guests, 1), 0) > 20 then
    raise exception 'input too long' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_guests, '{}')) g where length(trim(g)) = 0 or length(g) > 120) then
    raise exception 'every guest needs a name' using errcode = '22023';
  end if;
  if p_photo_path is not null and p_photo_path !~ (
       '^' || case p_source when 'desk' then 'desk' when 'own_phone' then 'phone' else 'staff' end || '/[0-9a-f-]{36}\.jpg$') then
    raise exception 'bad photo path' using errcode = '22023';
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
                             phone_token_hash, origin_hash, watchlist_id)
  values (h, p_invite_id, trim(p_visitor_name), nullif(trim(p_company), ''), nullif(trim(p_mobile), ''),
          nullif(trim(p_purpose), ''), p_photo_path, p_source, p_device,
          case when p_source = 'reception' then auth.uid() end,
          st, t, case when st = 'checked_in' then t end, c, p_phone_token_hash, p_origin_hash, wl)
  returning id into v;

  insert into public.visit_guests (visit_id, full_name)
  select v, trim(g) from unnest(coalesce(p_guests, '{}')) g;

  return query
    select v, t, s.full_name, s.department, st, c
      from (select 1) x left join public.staff s on s.id = h;
end $$;

-- The desk needs to know when a check-in was held, to send the visitor to reception.
drop function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid);
create function public.kiosk_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text,
  p_invite_id uuid default null
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text, held boolean)
language plpgsql security definer set search_path = '' as $$
declare d uuid := public.kiosk_device();
begin
  return query
    select r.visit_id, r.checked_in_at, r.host_name, r.host_department, r.status = 'arriving'
      from public.create_visit('desk', d, p_visitor_name, p_company, p_mobile, p_purpose,
                               p_host_id, p_guests, p_photo_path, p_invite_id) r;
end $$;

revoke execute on function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid) from public, anon;
grant execute on function public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid) to authenticated;

-- ---------------------------------------------------------------- emergency roll call

create table public.roll_calls (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references public.staff on delete set null,
  started_at timestamptz not null default now(),
  ended_by uuid references public.staff on delete set null,
  ended_at timestamptz
);
create unique index roll_calls_one_active on public.roll_calls ((ended_at is null)) where ended_at is null;

create table public.roll_call_marks (
  roll_call_id uuid not null references public.roll_calls on delete cascade,
  person_id uuid not null, -- a visit (the main visitor) or a visit_guests row
  marked_by uuid references public.staff on delete set null,
  marked_at timestamptz not null default now(),
  primary key (roll_call_id, person_id)
);

alter table public.roll_calls enable row level security;
alter table public.roll_call_marks enable row level security;
-- Any active staff member can be a marshal. Writes go through the functions below.
create policy roll_calls_read on public.roll_calls for select to authenticated using (public.current_staff_role() is not null);
create policy roll_call_marks_read on public.roll_call_marks for select to authenticated using (public.current_staff_role() is not null);

create function public.start_roll_call() returns uuid
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  if public.current_staff_role() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select id into r from public.roll_calls where ended_at is null;
  if r is null then
    insert into public.roll_calls (started_by) values (auth.uid()) returning id into r;
  end if;
  return r;
end $$;

create function public.end_roll_call(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_staff_role() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.roll_calls set ended_at = now(), ended_by = auth.uid() where id = p_id and ended_at is null;
end $$;

create function public.mark_safe(p_id uuid, p_person uuid, p_safe boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_staff_role() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roll_calls where id = p_id and ended_at is null) then
    raise exception 'roll call has ended' using errcode = '22023';
  end if;
  if p_safe then
    insert into public.roll_call_marks (roll_call_id, person_id, marked_by) values (p_id, p_person, auth.uid())
    on conflict do nothing;
  else
    delete from public.roll_call_marks where roll_call_id = p_id and person_id = p_person;
  end if;
end $$;

-- Everyone in the building, for every marshal, but only while a roll call is running: in an
-- emergency, hosts need to see visitors who aren't theirs.
create function public.roll_call_people()
returns table (person_id uuid, visit_id uuid, full_name text, company text, host text, mobile text,
               photo_path text, is_guest boolean, arrived_at timestamptz, marked_at timestamptz, marked_by text)
language sql stable security definer set search_path = '' as $$
  with rc as (select id from public.roll_calls where ended_at is null),
  people as (
    select v.id as person_id, v.id as visit_id, v.visitor_name as full_name, v.company, v.host_id, v.mobile,
           v.photo_path, false as is_guest, v.arrived_at
      from public.visits v
     where v.status = 'checked_in' or (v.status = 'arriving' and v.arrived_at > now() - interval '30 minutes')
    union all
    select g.id, v.id, g.full_name, v.company, v.host_id, null, null, true, v.arrived_at
      from public.visit_guests g join public.visits v on v.id = g.visit_id
     where g.checked_out_at is null
       and (v.status = 'checked_in' or (v.status = 'arriving' and v.arrived_at > now() - interval '30 minutes'))
  )
  select p.person_id, p.visit_id, p.full_name, p.company, coalesce(s.full_name, 'Reception'), p.mobile,
         p.photo_path, p.is_guest, p.arrived_at, m.marked_at, ms.full_name
    from people p
    cross join rc
    left join public.staff s on s.id = p.host_id
    left join public.roll_call_marks m on m.roll_call_id = rc.id and m.person_id = p.person_id
    left join public.staff ms on ms.id = m.marked_by
   where public.current_staff_role() is not null
   order by m.marked_at nulls first, p.full_name
$$;

revoke execute on function public.start_roll_call(), public.end_roll_call(uuid), public.mark_safe(uuid, uuid, boolean),
  public.roll_call_people() from public, anon;
grant execute on function public.start_roll_call(), public.end_roll_call(uuid), public.mark_safe(uuid, uuid, boolean),
  public.roll_call_people() to authenticated;

alter publication supabase_realtime add table public.roll_calls, public.roll_call_marks;

-- ---------------------------------------------------------------- audit log

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,       -- the signed-in staff member or desk device; null = server (visitor phone, email link, daily job)
  entity text not null,
  entity_id uuid,
  action text not null, -- INSERT / UPDATE / DELETE, or an app event like password_reset
  changes jsonb     -- insert/delete: the row; update: {column: [old, new]}; plus _label for display
);
create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;
-- Admins read it. Nobody writes it directly: the trigger and the server do.
create policy audit_log_admin on public.audit_log for select to authenticated using (public.current_staff_role() = 'admin');

create function public.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  d jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if o -> k is distinct from n -> k then
        d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
  else
    d := r;
  end if;
  -- Never keep secrets, and skip pure bookkeeping (the desk touches last_seen_at on every call).
  d := d - 'enrollment_code_hash' - 'phone_token_hash' - 'origin_hash' - 'last_seen_at' - 'enrollment_expires_at';
  if d = '{}' then return null; end if;
  insert into public.audit_log (actor, entity, entity_id, action, changes)
  values (auth.uid(), tg_table_name, coalesce(r ->> 'id', r ->> 'person_id')::uuid, tg_op,
          d || jsonb_build_object('_label', coalesce(r ->> 'visitor_name', r ->> 'full_name', r ->> 'name', r ->> 'reason')));
  return null;
end $$;

create trigger audit after insert or update or delete on public.staff for each row execute function public.audit();
create trigger audit after insert or update or delete on public.kiosk_devices for each row execute function public.audit();
create trigger audit after insert or update or delete on public.visits for each row execute function public.audit();
create trigger audit after update on public.visit_guests for each row execute function public.audit();
create trigger audit after insert or update or delete on public.invites for each row execute function public.audit();
create trigger audit after insert or update or delete on public.watchlist for each row execute function public.audit();
create trigger audit after insert or update on public.roll_calls for each row execute function public.audit();
create trigger audit after insert or delete on public.roll_call_marks for each row execute function public.audit();
