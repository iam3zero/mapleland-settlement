// Server-only adapter. Never import this file into the frontend.
export function createSupabaseDatabase(url, serviceRoleKey, fetcher = fetch) {
  if (!url || !serviceRoleKey) throw new Error('서버의 Supabase 설정이 필요합니다.')
  const request = async (path, method = 'GET', body) => {
    const response = await fetcher(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
      method, headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    let result
    try { result = text ? JSON.parse(text) : null } catch { throw new Error('정산방 DB 응답을 처리하지 못했습니다.') }
    if (!response.ok) {
      if (result?.code === '23505') throw Object.assign(new Error('방 코드 중복'), { code: 'ROOM_CODE_CONFLICT' })
      if (result?.code === '40001') throw new Error('다른 화면에서 변경된 기록입니다. 최신 기록을 다시 열어주세요.')
      if (result?.code === '28000') throw new Error('관리자 비밀번호를 다시 확인해주세요.')
      throw new Error('정산방 DB 요청에 실패했습니다.')
    }
    return result
  }
  const roomFromDb = row => row ? ({ roomId: row.room_id, roomCode: row.room_code, roomName: row.room_name, icon: row.icon, adminPasswordHash: row.admin_password_hash, createdAt: row.created_at, updatedAt: row.updated_at }) : null
  const recordFromDb = row => row ? ({ settlementId: row.settlement_id, roomId: row.room_id, data: row.data, result: row.result, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at }) : null
  const sessionToDb = value => ({ room_id: value.roomId, token_hash: value.tokenHash, expires_at: value.expiresAt })
  return {
    async listAllRooms(offset) { return (await request('rpc/room_api_list_all', 'POST', { p_offset: offset })).map(row => ({ ...roomFromDb(row), latestSettlementDate: row.latest_settlement_date, lastActivityAt: row.last_activity_at })) },
    async renameRoom(roomId, hash, name) { await request('rpc/room_api_rename', 'POST', { p_room_id: roomId, p_token_hash: hash, p_name: name }) },
    async listRooms(codes) { return (await request('rpc/room_api_list_known', 'POST', { p_codes: codes })).map(row => ({ ...roomFromDb(row), latestSettlementDate: row.latest_settlement_date })) },
    async deleteRoom(roomId, hash) { await request('rpc/room_api_delete', 'POST', { p_room_id: roomId, p_token_hash: hash }) },
    async findRoom(code) { return roomFromDb((await request(`settlement_rooms?room_code=eq.${encodeURIComponent(code)}&limit=1`))[0]) },
    async insertRoom(room, session) { await request('rpc/room_api_create', 'POST', { p_room: room, p_session: session }) },
    async listSettlements(roomId) { return (await request(`room_settlements?room_id=eq.${encodeURIComponent(roomId)}&order=updated_at.desc`)).map(recordFromDb) },
    async findSettlement(roomId, id) { return recordFromDb((await request(`room_settlements?room_id=eq.${encodeURIComponent(roomId)}&settlement_id=eq.${encodeURIComponent(id)}&limit=1`))[0]) },
    async saveSettlement(record, previousRevision) { await request('rpc/room_api_save', 'POST', { p_record: record, p_previous_revision: previousRevision }) },
    async insertSession(session) { await request('room_admin_sessions', 'POST', sessionToDb(session)) },
    async getSession(hash) {
      if (!hash) return null
      const row = (await request(`room_admin_sessions?token_hash=eq.${hash}&limit=1`))[0]
      return row ? { roomId: row.room_id, tokenHash: row.token_hash, expiresAt: row.expires_at } : null
    },
    async deleteSession(hash) { if (hash) await request(`room_admin_sessions?token_hash=eq.${hash}`, 'DELETE') },
    async consumeLimit(bucket, limit, seconds) { return request('rpc/room_api_consume_limit', 'POST', { p_bucket: bucket, p_limit: limit, p_seconds: seconds }) },
  }
}
