-- Returning visitors: the desk device and reception look up the last visit by mobile number to fill
-- in the form. Not offered to the public phone flow, where anyone could try numbers and read names;
-- a visitor's own phone autofills from the browser instead.

-- Last 10 digits, so "+91 98765 43210" and "9876543210" are the same person.
create function public.mobile_key(m text) returns text
language sql immutable set search_path = '' as
  $$ select nullif(right(regexp_replace(coalesce(m, ''), '\D', '', 'g'), 10), '') $$;

create index visits_mobile_key_idx on public.visits (public.mobile_key(mobile));

-- Name, company and last host from the latest visit that got in (declined/expired ones don't count),
-- plus how many visits that number has made. Desk devices are limited to 30 lookups per 10 minutes.
create function public.returning_visitor(p_mobile text)
returns table (visitor_name text, company text, host_id uuid, host_name text, host_department text, visits int)
language plpgsql security definer set search_path = '' as $$
declare k text := public.mobile_key(p_mobile);
begin
  if public.is_reception() then
    null;
  elsif public.is_active_device() then
    if not public.rate_limit('returning:' || auth.uid()::text, 30, 600) then
      raise exception 'too many lookups' using errcode = '54000';
    end if;
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if k is null or length(k) < 10 then return; end if;
  return query
    select v.visitor_name, v.company, s.id, s.full_name, s.department,
           (select count(*)::int from public.visits x
             where public.mobile_key(x.mobile) = k and x.status in ('checked_in', 'checked_out'))
      from public.visits v
      left join public.staff s on s.id = v.host_id and s.active
     where public.mobile_key(v.mobile) = k and v.status in ('checked_in', 'checked_out')
     order by v.arrived_at desc
     limit 1;
end $$;

revoke execute on function public.returning_visitor(text) from public, anon;
grant execute on function public.returning_visitor(text) to authenticated;
