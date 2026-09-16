import { protectPassword, verifyPassword } from '../settlement/auth.js'
import { migrateSettlement, serializable, validateForSave } from '../settlement/model.js'
import { createToken, normalizeRoomCode, publicRoom, roomCode, sortRooms, tokenHash } from './domain.js'
import { ROOM_ICONS } from './icons.js'

// Shared application service. The cloud server supplies a DB adapter; local mode supplies localStorage.
// All cloud mutations execute this code on the server, never trusting client-provided results.
export function createRoomService(database, { generateCode = roomCode, now = () => new Date() } = {}) {
  const get = async code => {
    const room = await database.findRoom(normalizeRoomCode(code))
    if (!room) throw new Error('정산방을 찾을 수 없습니다. 방 코드와 저장 모드를 확인해주세요.')
    return room
  }
  const grant = async roomId => {
    const token = createToken()
    const session = { roomId, tokenHash: await tokenHash(token), expiresAt: new Date(now().getTime() + 15 * 60 * 1000).toISOString() }
    return { token, session }
  }
  const requireAdmin = async (room, token) => {
    const session = await database.getSession(await tokenHash(token))
    if (!session || session.roomId !== room.roomId || Date.parse(session.expiresAt) <= now().getTime()) throw new Error('관리자 비밀번호를 다시 확인해주세요.')
  }
  return {
    async createRoom({ roomName, password, icon = '🍁' }) {
      const name = String(roomName ?? '').trim()
      if (!name || name.length > 60) throw new Error('방 이름을 1~60자로 입력해주세요.')
      if (!ROOM_ICONS.includes(icon)) throw new Error('목록에서 정산방 아이콘을 선택해주세요.')
      const adminPasswordHash = await protectPassword(password)
      for (let attempt = 0; attempt < 12; attempt++) {
        const timestamp = now().toISOString()
        const room = { roomId: crypto.randomUUID(), roomCode: normalizeRoomCode(generateCode()), roomName: name, icon, adminPasswordHash, createdAt: timestamp, updatedAt: timestamp }
        const access = await grant(room.roomId)
        try {
          await database.insertRoom(room, access.session)
          return { room: publicRoom(room), token: access.token, expiresAt: access.session.expiresAt }
        } catch (error) { if (error.code !== 'ROOM_CODE_CONFLICT') throw error }
      }
      throw new Error('새 방 코드를 생성하지 못했습니다. 다시 시도해주세요.')
    },
    async getRoom(code) {
      const room = await get(code)
      const settlements = await database.listSettlements(room.roomId)
      settlements.sort((a, b) => b.data.date.localeCompare(a.data.date) || b.updatedAt.localeCompare(a.updatedAt))
      return { room: publicRoom(room), settlements }
    },
    async listRooms(codes) {
      if (!Array.isArray(codes) || codes.length > 30) throw new Error('최근 정산방은 최대 30개까지 조회할 수 있습니다.')
      const rooms = await database.listRooms([...new Set(codes.map(normalizeRoomCode))])
      return sortRooms(rooms.map(room => ({ ...publicRoom(room), latestSettlementDate: room.latestSettlementDate ?? null })))
    },
    async listAllRooms(offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('정산방 목록 페이지를 확인해주세요.')
      const rows = await database.listAllRooms(offset)
      return { rooms: rows.slice(0, 30).map(room => ({ ...publicRoom(room), latestSettlementDate: room.latestSettlementDate ?? null, lastActivityAt: room.lastActivityAt ?? room.createdAt })), hasMore: rows.length > 30 }
    },
    async renameRoom(code, token, password, roomName) {
      const name = typeof roomName === 'string' ? roomName.trim() : ''
      if (!name || name.length > 60) throw new Error('방 이름을 1~60자로 입력해주세요.')
      const room = await get(code)
      await requireAdmin(room, token)
      if (!await verifyPassword(password, room.adminPasswordHash)) throw new Error('비밀번호가 일치하지 않습니다.')
      await database.renameRoom(room.roomId, await tokenHash(token), name)
      return publicRoom({ ...room, roomName: name })
    },
    async deleteRoom(code, token, password) {
      const room = await get(code)
      await requireAdmin(room, token)
      if (!await verifyPassword(password, room.adminPasswordHash)) throw new Error('비밀번호가 일치하지 않습니다.')
      // The database rechecks the session in the same transaction as cascading deletion.
      await database.deleteRoom(room.roomId, await tokenHash(token))
    },
    async unlock(code, password) {
      const room = await get(code)
      if (!await verifyPassword(password, room.adminPasswordHash)) throw new Error('비밀번호가 일치하지 않습니다.')
      const access = await grant(room.roomId)
      await database.insertSession(access.session)
      return { token: access.token, expiresAt: access.session.expiresAt }
    },
    async saveSettlement(code, token, data, { settlementId, revision } = {}) {
      const room = await get(code)
      await requireAdmin(room, token)
      const draft = migrateSettlement(data)
      const result = serializable(validateForSave(draft))
      const timestamp = now().toISOString()
      const original = settlementId ? await database.findSettlement(room.roomId, settlementId) : null
      if (settlementId && (!original || original.revision !== revision)) throw new Error('다른 화면에서 변경된 기록입니다. 최신 기록을 다시 열어주세요.')
      if (original && original.data.mode !== draft.mode) throw new Error('저장된 기록의 보스와 정산 종류는 변경할 수 없습니다.')
      const record = { settlementId: settlementId ?? crypto.randomUUID(), roomId: room.roomId, data: draft, result, revision: original ? original.revision + 1 : 1, createdAt: original?.createdAt ?? timestamp, updatedAt: timestamp }
      await database.saveSettlement(record, original?.revision ?? null)
      return record
    },
    async revoke(token) { await database.deleteSession(await tokenHash(token)) },
  }
}
