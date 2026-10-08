-- Invites, own-phone check-in, and one shared check-in path for every source.

alter table public.visits
  add column phone_token_hash text unique, -- sha256 of the secret the visitor's phone keeps
  add column origin_hash text;             -- sha256 of the own-phone request IP, for rate limiting

create index visits_origin_idx on public.visits (origin_hash, arrived_at) where origin_hash is not null;
create index invites_day_idx on public.invites (visit_date, status);

create function public.office_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------------------------------------------------------------- core (server only)

-- Today's pending invite for a code. Codes are stored as 6 upper-case characters, no dash.
create function public.redeem_invite(p_code text)
returns table (invite_id uuid, visitor_name text, visitor_company text, purpose text,
               host_id uuid, host_name text, host_department text, guests text[])
language sql stable security definer set search_path = '' as $$
  select i.id, i.visitor_name, i.visitor_company, i.purpose, s.id, s.full_name, s.department,
         coalesce((select array_agg(g.full_name order by g.full_name) from public.invite_guests g where g.invite_id = i.id), '{}')
    from public.invites i join public.staff s on s.id = i.host_id and s.active
   where i.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     and i.status = 'pending'
     and i.visit_date = public.office_today()
$$;

-- Every check-in, from any source, goes through here.
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
  p_origin_hash text default null
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text, status public.visit_status, code char(3))
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
  t timestamptz := now();
  st public.visit_status := case when p_source = 'own_phone' then 'arriving' else 'checked_in' end;
  c char(3) := case when p_source = 'own_phone' then (100 + floor(random() * 900))::int::text end;
  h uuid := p_host_id;
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

  insert into public.visits (host_id, invite_id, visitor_name, company, mobile, purpose, photo_path, source,
                             device_id, checked_in_by, status, arrived_at, checked_in_at, code,
                             phone_token_hash, origin_hash)
  values (h, p_invite_id, trim(p_visitor_name), nullif(trim(p_company), ''), nullif(trim(p_mobile), ''),
          nullif(trim(p_purpose), ''), p_photo_path, p_source, p_device,
          case when p_source = 'reception' then auth.uid() end,
          st, t, case when st = 'checked_in' then t end, c, p_phone_token_hash, p_origin_hash)
  returning id into v;

  insert into public.visit_guests (visit_id, full_name)
  select v, trim(g) from unnest(coalesce(p_guests, '{}')) g;

  return query
    select v, t, s.full_name, s.department, st, c
      from (select 1) x left join public.staff s on s.id = h;
end $$;

revoke execute on function
  public.redeem_invite(text),
  public.create_visit(public.visit_source, uuid, text, text, text, text, uuid, text[], text, uuid, text, text)
from public, anon, authenticated;
grant execute on function
  public.redeem_invite(text),
  public.create_visit(public.visit_source, uuid, text, text, text, text, uuid, text[], text, uuid, text, text)
to service_role;

-- ---------------------------------------------------------------- desk device

create function public.kiosk_redeem_invite(p_code text)
returns table (invite_id uuid, visitor_name text, visitor_company text, purpose text,
               host_id uuid, host_name text, host_department text, guests text[])
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kiosk_device();
  return query select * from public.redeem_invite(p_code);
end $$;

drop function public.kiosk_check_in(text, text, text, text, uuid, text[], text);
create function public.kiosk_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text,
  p_invite_id uuid default null
) returns table (visit_id uuid, checked_in_at timestamptz, host_name text, host_department text)
language plpgsql security definer set search_path = '' as $$
declare d uuid := public.kiosk_device();
begin
  return query
    select r.visit_id, r.checked_in_at, r.host_name, r.host_department
      from public.create_visit('desk', d, p_visitor_name, p_company, p_mobile, p_purpose,
                               p_host_id, p_guests, p_photo_path, p_invite_id) r;
end $$;

revoke execute on function
  public.kiosk_redeem_invite(text),
  public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid)
from public, anon;
grant execute on function
  public.kiosk_redeem_invite(text),
  public.kiosk_check_in(text, text, text, text, uuid, text[], text, uuid)
to authenticated;

-- ---------------------------------------------------------------- reception

-- Reception checks in an expected visitor with one click.
create function public.staff_check_in_invite(p_invite_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  i record;
  v uuid;
begin
  if not public.is_reception() then
    raise exception 'reception only' using errcode = '42501';
  end if;
  select visitor_name, visitor_company, purpose,
         coalesce((select array_agg(g.full_name) from public.invite_guests g where g.invite_id = p_invite_id), '{}') as guests
    into i from public.invites where id = p_invite_id;
  if not found then
    raise exception 'invite not valid today' using errcode = '22023';
  end if;
  select r.visit_id into v
    from public.create_visit('reception', null, i.visitor_name, i.visitor_company, null, i.purpose,
                             null, i.guests, null, p_invite_id) r;
  return v;
end $$;

revoke execute on function public.staff_check_in_invite(uuid) from public, anon;
grant execute on function public.staff_check_in_invite(uuid) to authenticated;
