-- Host approval: the host answers "I'm coming down" or "Not available" for their visitor.

create type public.host_response as enum ('coming', 'unavailable');

alter table public.visits
  add column host_response public.host_response,
  add column host_responded_at timestamptz;

-- Hosts can't update visits directly (RLS: reception only), so this narrow function lets a host
-- answer for their own visitor while the visit is still open. The signed email link does the same
-- through server code with the service role.
create function public.host_respond(p_visit_id uuid, p_response public.host_response) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.visits set host_response = p_response, host_responded_at = now()
   where id = p_visit_id and host_id = auth.uid() and status in ('arriving', 'checked_in');
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke execute on function public.host_respond(uuid, public.host_response) from public, anon;
grant execute on function public.host_respond(uuid, public.host_response) to authenticated;
