-- Public summaries are served by Edge only; no new anon table policies.
create function public.room_api_list_all(p_offset integer default 0)
returns table(room_id uuid, room_code text, room_name text, icon text, created_at timestamptz, updated_at timestamptz, latest_settlement_date text, last_activity_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'Invalid page'; end if;
  return query
    select r.room_id, r.room_code, r.room_name, r.icon, r.created_at, r.updated_at,
      s.data->>'date', coalesce(s.updated_at, r.created_at)
    from public.settlement_rooms r
    left join lateral (select records.data, records.updated_at from public.room_settlements records where records.room_id=r.room_id order by records.updated_at desc, records.settlement_id limit 1) s on true
    order by coalesce(s.updated_at, r.created_at) desc, r.room_id
    limit 31 offset p_offset;
end;
$$;

create function public.room_api_rename(p_room_id uuid, p_token_hash text, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Invalid room name'; end if;
  perform 1 from public.settlement_rooms where room_id=p_room_id for update;
  perform 1 from public.room_admin_sessions where room_id=p_room_id and token_hash=p_token_hash and expires_at>clock_timestamp() for update;
  if not found then raise exception 'Expired or invalid admin session' using errcode='28000'; end if;
  update public.settlement_rooms set room_name=btrim(p_name) where room_id=p_room_id;
end;
$$;
revoke all on function public.room_api_list_all(integer), public.room_api_rename(uuid,text,text) from public, anon, authenticated;
grant execute on function public.room_api_list_all(integer), public.room_api_rename(uuid,text,text) to service_role;
