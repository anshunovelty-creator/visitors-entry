-- audit() only ever runs as a trigger (Postgres checks EXECUTE when the trigger is created, not
-- when it fires), so nobody needs to call it through the API.
revoke execute on function public.audit() from public, anon, authenticated;
