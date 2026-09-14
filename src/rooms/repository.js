import { createLocalRoomDatabase } from './localRoomRepository.js'
import { createRoomService } from './roomService.js'

export function createSupabaseRoomRepository({ url, publicKey = '', fetcher = fetch }) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('Supabase 연결에는 HTTPS URL이 필요합니다.')
  const endpoint = `${parsed.origin}/functions/v1/room-api`
  const call = async (action, payload) => {
    let response
    try { response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(publicKey ? { apikey: publicKey } : {}) }, body: JSON.stringify({ action, ...payload }) }) }
    catch { throw new Error('클라우드에 연결할 수 없습니다. 로컬로 대신 저장하지 않았습니다.') }
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.error) throw new Error(body.error || '정산방 서버 요청에 실패했습니다.')
    return body
  }
  return {
    createRoom: payload => call('create', payload),
    getRoom: roomCode => call('read', { roomCode }),
    unlock: (roomCode, password) => call('unlock', { roomCode, password }),
    saveSettlement: (roomCode, token, data, options = {}) => call('save', { roomCode, token, data, ...options }),
    revoke: token => call('revoke', { token }),
  }
}
export function configureRoomRepository(env = {}, storage, fetcher) {
  const mode = env.VITE_ROOM_STORAGE || 'local'
  if (mode === 'supabase') {
    if (!env.VITE_SUPABASE_URL) throw new Error('Supabase 프로젝트 URL이 설정되지 않았습니다.')
    return { mode, service: createSupabaseRoomRepository({ url: env.VITE_SUPABASE_URL, publicKey: env.VITE_SUPABASE_ANON_KEY, fetcher }) }
  }
  if (mode !== 'local') throw new Error('정산방 저장 모드 설정을 확인해주세요.')
  return { mode, service: createRoomService(createLocalRoomDatabase(storage)) }
}
