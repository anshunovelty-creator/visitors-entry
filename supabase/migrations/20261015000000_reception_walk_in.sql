-- Reception checks in a walk-in visitor (no invite) from the staff console. The photo is optional.

create function public.staff_check_in(
  p_visitor_name text,
  p_company text,
  p_mobile text,
  p_purpose text,
  p_host_id uuid,
  p_guests text[],
  p_photo_path text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.is_reception() then
    raise exception 'reception only' using errcode = '42501';
  end if;
  select r.visit_id into v
    from public.create_visit('reception', null, p_visitor_name, p_company, p_mobile, p_purpose,
                             p_host_id, p_guests, p_photo_path) r;
  return v;
end $$;

revoke execute on function public.staff_check_in(text, text, text, text, uuid, text[], text) from public, anon;
grant execute on function public.staff_check_in(text, text, text, text, uuid, text[], text) to authenticated;

-- Reception may upload under staff/ (create_visit only accepts staff/ paths for reception check-ins).
create policy photos_reception_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[1] = 'staff'
    and public.is_reception()
  );
