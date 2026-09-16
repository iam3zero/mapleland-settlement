import { normalizeRoomCode } from './domain.js'

// This browser remembers codes only. Names, icons and dates are fetched from the repository.
export const VISITED_ROOMS_KEY = 'meraen-settlement.visited-rooms.v1'
export function visitedRooms(storage, mode) {
  const key = `${VISITED_ROOMS_KEY}.${mode}`
  const read = () => {
    try { const data = JSON.parse(storage.getItem(key) ?? '[]'); return Array.isArray(data) ? data.filter(code => typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code)).slice(0, 30) : [] } catch { return [] }
  }
  const write = codes => { try { storage.setItem(key, JSON.stringify(codes)); return true } catch { return false } }
  return {
    read,
    remember(code) { const value = normalizeRoomCode(code); return write([value, ...read().filter(item => item !== value)].slice(0, 30)) },
    forget(code) { return write(read().filter(item => item !== code)) },
  }
}
