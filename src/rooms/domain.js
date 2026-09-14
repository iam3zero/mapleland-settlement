export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function roomCode(bytes = crypto.getRandomValues(new Uint8Array(6))) {
  if (bytes.length !== 6) throw new Error('방 코드 생성에 실패했습니다.')
  return Array.from(bytes, byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
}
export function normalizeRoomCode(code) {
  const value = String(code ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(value)) throw new Error('영문·숫자 6자리 방 코드를 입력해주세요.')
  return value
}
export function roomLink(code, origin = window.location.origin) {
  return `${origin}/#/room/${normalizeRoomCode(code)}`
}
export const publicRoom = room => ({ roomId: room.roomId, roomCode: room.roomCode, roomName: room.roomName, createdAt: room.createdAt, updatedAt: room.updatedAt })
export async function tokenHash(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export const createToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
