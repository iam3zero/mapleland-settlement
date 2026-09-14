-- Login-free room access goes through room-api. No direct anonymous DB access.
create table public.settlement_rooms (
  room_id uuid primary key,
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  room_name text not null check (char_length(room_name) between 1 and 60),
  admin_password_hash jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.room_settlements (
  settlement_id uuid primary key,
  room_id uuid not null references public.settlement_rooms(room_id) on delete cascade,
  data jsonb not null,
  result jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index room_settlements_room_idx on public.room_settlements(room_id, updated_at desc);
create table public.room_admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  room_id uuid not null references public.settlement_rooms(room_id) on delete cascade,
  expires_at timestamptz not null
);
create index room_admin_sessions_expiry_idx on public.room_admin_sessions(expires_at);
create table public.room_api_limits (
  bucket_key text primary key,
  attempts integer not null,
  reset_at timestamptz not null
);

alter table public.settlement_rooms enable row level security;
alter table public.room_settlements enable row level security;
alter table public.room_admin_sessions enable row level security;
alter table public.room_api_limits enable row level security;
-- Intentionally no anon/authenticated policies. Hashes and tokens are server-only.
revoke all on public.settlement_rooms, public.room_settlements, public.room_admin_sessions, public.room_api_limits from public, anon, authenticated;
grant select, insert, update, delete on public.settlement_rooms, public.room_settlements, public.room_admin_sessions, public.room_api_limits to service_role;

create function public.room_api_create(p_room jsonb, p_session jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settlement_rooms(room_id, room_code, room_name, admin_password_hash, created_at, updated_at)
  values ((p_room->>'roomId')::uuid, p_room->>'roomCode', p_room->>'roomName', p_room->'adminPasswordHash', (p_room->>'createdAt')::timestamptz, (p_room->>'updatedAt')::timestamptz);
  insert into public.room_admin_sessions(token_hash, room_id, expires_at)
  values (p_session->>'tokenHash', (p_session->>'roomId')::uuid, (p_session->>'expiresAt')::timestamptz);
end;
$$;

create function public.room_api_save(p_record jsonb, p_previous_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if p_previous_revision is null then
    insert into public.room_settlements(settlement_id, room_id, data, result, revision, created_at, updated_at)
    values ((p_record->>'settlementId')::uuid, (p_record->>'roomId')::uuid, p_record->'data', p_record->'result', 1, (p_record->>'createdAt')::timestamptz, (p_record->>'updatedAt')::timestamptz);
  else
    update public.room_settlements set data = p_record->'data', result = p_record->'result', revision = p_previous_revision + 1, updated_at = (p_record->>'updatedAt')::timestamptz
    where settlement_id = (p_record->>'settlementId')::uuid and room_id = (p_record->>'roomId')::uuid and revision = p_previous_revision;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Revision conflict' using errcode = '40001'; end if;
  end if;
  update public.settlement_rooms set updated_at = (p_record->>'updatedAt')::timestamptz where room_id = (p_record->>'roomId')::uuid;
end;
$$;

create function public.room_api_consume_limit(p_bucket text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_count integer;
begin
  delete from public.room_api_limits where reset_at < now() - interval '1 day';
  delete from public.room_admin_sessions where expires_at < now();
  insert into public.room_api_limits(bucket_key, attempts, reset_at) values (p_bucket, 1, now() + make_interval(secs => p_seconds))
  on conflict (bucket_key) do update set
    attempts = case when public.room_api_limits.reset_at <= now() then 1 else public.room_api_limits.attempts + 1 end,
    reset_at = case when public.room_api_limits.reset_at <= now() then now() + make_interval(secs => p_seconds) else public.room_api_limits.reset_at end
  returning attempts into current_count;
  return current_count <= p_limit;
end;
$$;
revoke all on function public.room_api_create(jsonb, jsonb), public.room_api_save(jsonb, integer), public.room_api_consume_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.room_api_create(jsonb, jsonb), public.room_api_save(jsonb, integer), public.room_api_consume_limit(text, integer, integer) to service_role;
