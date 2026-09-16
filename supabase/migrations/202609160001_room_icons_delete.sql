-- Additive only: legacy rooms remain NULL and the application displays the maple icon.
alter table public.settlement_rooms add column icon text check (icon is null or char_length(icon) between 1 and 16);

create or replace function public.room_api_create(p_room jsonb, p_session jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settlement_rooms(room_id, room_code, room_name, icon, admin_password_hash, created_at, updated_at)
  values ((p_room->>'roomId')::uuid, p_room->>'roomCode', p_room->>'roomName', p_room->>'icon', p_room->'adminPasswordHash', (p_room->>'createdAt')::timestamptz, (p_room->>'updatedAt')::timestamptz);
  insert into public.room_admin_sessions(token_hash, room_id, expires_at)
  values (p_session->>'tokenHash', (p_session->>'roomId')::uuid, (p_session->>'expiresAt')::timestamptz);
end;
$$;

-- Only the supplied known codes are listed, never a global room directory.
create function public.room_api_list_known(p_codes text[])
returns table(room_id uuid, room_code text, room_name text, icon text, created_at timestamptz, updated_at timestamptz, latest_settlement_date text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_codes), 0) > 30 then raise exception 'Too many room codes'; end if;
  return query select r.room_id, r.room_code, r.room_name, r.icon, r.created_at, r.updated_at,
    (select max(s.data->>'date') from public.room_settlements s where s.room_id = r.room_id)
    from public.settlement_rooms r where r.room_code = any(p_codes);
end;
$$;

create function public.room_api_delete(p_room_id uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.settlement_rooms where room_id = p_room_id for update;
  perform 1 from public.room_admin_sessions where room_id = p_room_id and token_hash = p_token_hash and expires_at > clock_timestamp() for update;
  if not found then raise exception 'Expired or invalid admin session' using errcode = '28000'; end if;
  -- Existing foreign keys cascade to settlements and all administrator sessions.
  delete from public.settlement_rooms where room_id = p_room_id;
end;
$$;

revoke all on function public.room_api_list_known(text[]), public.room_api_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.room_api_list_known(text[]), public.room_api_delete(uuid, text) to service_role;
