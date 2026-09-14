import { protectPassword, validProtection, verifyPassword } from './auth.js'
import { serializable, validateDraft, validateForSave } from './model.js'

export const RECORDS_KEY = 'meraen-settlement.records.v1'

// Storage/auth are separate from the UI. A future server adapter can expose the same methods.
export function createRecordRepository(storage) {
  const permissions = new WeakMap()
  const read = () => {
    if (!storage) throw new Error('브라우저 저장 공간을 사용할 수 없습니다. 브라우저 설정을 확인해주세요.')
    let raw
    try { raw = storage.getItem(RECORDS_KEY) } catch { throw new Error('저장된 기록을 읽을 수 없습니다. 브라우저 저장 권한을 확인해주세요.') }
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error()
      const ids = new Set()
      for (const record of parsed.records) {
        if (!record.id || ids.has(record.id) || !Number.isInteger(record.revision) || record.revision < 1 || !Number.isFinite(Date.parse(record.savedAt)) || !Number.isFinite(Date.parse(record.createdAt)) || !validProtection(record.protection)) throw new Error()
        ids.add(record.id)
        validateDraft(record.data)
        if (JSON.stringify(serializable(validateForSave(record.data))) !== JSON.stringify(record.result)) throw new Error()
      }
      return parsed.records
    } catch { throw new Error('저장된 기록 형식을 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않았습니다.') }
  }
  const write = records => {
    try { storage.setItem(RECORDS_KEY, JSON.stringify({ version: 1, records })) }
    catch { throw new Error('저장 공간이 부족하거나 저장이 차단되었습니다. 기록은 저장되지 않았습니다.') }
  }
  const get = id => {
    const record = read().find(record => record.id === id)
    if (!record) throw new Error('정산 기록을 찾을 수 없습니다.')
    return record
  }
  return {
    list() { return read().sort((a, b) => b.data.date.localeCompare(a.data.date) || b.savedAt.localeCompare(a.savedAt)) },
    get,
    latest(mode) { return read().filter(record => record.data.mode === mode).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null },
    async create(data, password) {
      const snapshot = structuredClone(data)
      const result = validateForSave(snapshot)
      const protection = await protectPassword(password)
      const now = new Date().toISOString()
      const record = { id: crypto.randomUUID(), revision: 1, createdAt: now, savedAt: now, protection, data: snapshot, result: serializable(result) }
      write([...read(), record])
      return structuredClone(record)
    },
    async unlock(id, password) {
      const record = get(id)
      if (!await verifyPassword(password, record.protection)) throw new Error('비밀번호가 일치하지 않습니다.')
      if (get(id).revision !== record.revision) throw new Error('다른 화면에서 변경된 기록입니다. 다시 열어주세요.')
      const permit = Object.freeze({})
      permissions.set(permit, { id, revision: record.revision })
      return { permit, record }
    },
    update(id, data, permit) {
      const permission = permissions.get(permit)
      if (!permission || permission.id !== id) throw new Error('수정 비밀번호를 먼저 확인해주세요.')
      const records = read()
      const current = records.find(record => record.id === id)
      if (!current || current.revision !== permission.revision) throw new Error('다른 화면에서 변경된 기록입니다. 최신 기록을 다시 열어주세요.')
      if (data.mode !== current.data.mode) throw new Error('저장된 기록의 보스와 정산 종류는 변경할 수 없습니다.')
      const result = validateForSave(data)
      const updated = { ...current, revision: current.revision + 1, savedAt: new Date().toISOString(), data: structuredClone(data), result: serializable(result) }
      write(records.map(record => record.id === id ? updated : record))
      permissions.delete(permit)
      return updated
    },
    revoke(permit) { permissions.delete(permit) },
  }
}
