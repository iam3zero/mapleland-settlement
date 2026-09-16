-- One-off requested data update, not a schema migration.
begin;
do $$
declare
  target_id constant uuid := '6b350e52-827f-4d0a-9cc3-14d3104fc1e1';
  room_before jsonb;
  records_before jsonb;
  sessions_before jsonb;
begin
  perform 1 from public.settlement_rooms
    where room_id=target_id and room_name='🍀축캐 자쿰 외판공대' and room_code in ('6ZTN8W', '18PMMM') for update;
  if not found then raise exception 'Target room does not match; nothing changed'; end if;
  if exists(select 1 from public.settlement_rooms where room_code='18PMMM' and room_id<>target_id) then
    raise exception '18PMMM is already in use; nothing changed';
  end if;
  select to_jsonb(r)-'room_code' into room_before from public.settlement_rooms r where room_id=target_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by settlement_id), '[]'::jsonb) into records_before from public.room_settlements s where room_id=target_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by token_hash), '[]'::jsonb) into sessions_before from public.room_admin_sessions s where room_id=target_id;
  update public.settlement_rooms set room_code='18PMMM' where room_id=target_id;
  if room_before is distinct from (select to_jsonb(r)-'room_code' from public.settlement_rooms r where room_id=target_id)
    or records_before is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by settlement_id), '[]'::jsonb) from public.room_settlements s where room_id=target_id)
    or sessions_before is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by token_hash), '[]'::jsonb) from public.room_admin_sessions s where room_id=target_id)
  then raise exception 'Preservation check failed; rolling back'; end if;
end;
$$;
commit;
select room_id, room_code, room_name,
  (select count(*) from public.room_settlements s where s.room_id=r.room_id) as settlement_count
from public.settlement_rooms r where room_id='6b350e52-827f-4d0a-9cc3-14d3104fc1e1';
