import { validProtection } from '../settlement/auth.js'
import { serializable, validateDraft, validateForSave } from '../settlement/model.js'
export const ROOMS_KEY = 'meraen-settlement.rooms.v1'

// This namespace never rewrites or deletes the earlier standalone records key.
export function createLocalRoomDatabase(storage) {
  const sessions = new Map()
  const read = () => {
    if (!storage) throw new Error('브라우저 저장 공간을 사용할 수 없습니다.')
    let raw
    try { raw = storage.getItem(ROOMS_KEY) } catch { throw new Error('로컬 정산방을 읽을 수 없습니다.') }
    if (!raw) return { version: 1, rooms: [], settlements: [] }
    try {
      const data = JSON.parse(raw)
      if (data.version !== 1 || !Array.isArray(data.rooms) || !Array.isArray(data.settlements)) throw new Error()
      const codes = new Set(), ids = new Set(), records = new Set()
      for (const room of data.rooms) {
        if (!/^[A-Z0-9]{6}$/.test(room.roomCode) || !room.roomId || !room.roomName || !validProtection(room.adminPasswordHash) || codes.has(room.roomCode) || ids.has(room.roomId)) throw new Error()
        codes.add(room.roomCode); ids.add(room.roomId)
      }
      for (const record of data.settlements) {
        if (!ids.has(record.roomId) || !record.settlementId || records.has(record.settlementId) || !record.result?.total || !Number.isInteger(record.revision)) throw new Error()
        validateDraft(record.data); records.add(record.settlementId)
        if (JSON.stringify(record.result) !== JSON.stringify(serializable(validateForSave(record.data)))) throw new Error()
      }
      return data
    } catch { throw new Error('로컬 정산방 데이터가 손상되었습니다. 기존 데이터는 덮어쓰지 않았습니다.') }
  }
  const write = data => { try { storage.setItem(ROOMS_KEY, JSON.stringify(data)) } catch { throw new Error('저장 공간이 부족하거나 차단되어 정산방을 저장하지 못했습니다.') } }
  return {
    async findRoom(code) { return read().rooms.find(room => room.roomCode === code) ?? null },
    async insertRoom(room, session) {
      const data = read()
      if (data.rooms.some(value => value.roomCode === room.roomCode)) throw Object.assign(new Error('방 코드 중복'), { code: 'ROOM_CODE_CONFLICT' })
      write({ ...data, rooms: [...data.rooms, room] }); sessions.set(session.tokenHash, session)
    },
    async listSettlements(roomId) { return read().settlements.filter(record => record.roomId === roomId) },
    async findSettlement(roomId, id) { return read().settlements.find(record => record.roomId === roomId && record.settlementId === id) ?? null },
    async saveSettlement(record, previousRevision) {
      const data = read()
      const current = data.settlements.find(value => value.settlementId === record.settlementId)
      if (previousRevision !== null && (!current || current.roomId !== record.roomId || current.revision !== previousRevision)) throw new Error('다른 화면에서 변경된 기록입니다. 최신 기록을 다시 열어주세요.')
      if (previousRevision === null && current) throw new Error('이미 저장된 기록입니다.')
      write({ ...data, rooms: data.rooms.map(room => room.roomId === record.roomId ? { ...room, updatedAt: record.updatedAt } : room), settlements: current ? data.settlements.map(value => value.settlementId === record.settlementId ? record : value) : [...data.settlements, record] })
    },
    async insertSession(session) { sessions.set(session.tokenHash, session) },
    async getSession(hash) { return sessions.get(hash) ?? null },
    async deleteSession(hash) { sessions.delete(hash) },
  }
}
