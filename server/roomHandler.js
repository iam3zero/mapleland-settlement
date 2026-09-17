import { createRoomService } from '../src/rooms/roomService.js'
import { normalizeRoomCode } from '../src/rooms/domain.js'

export function createRoomHandler(database, { allowedOrigins = [], rateLimitSecret } = {}) {
  const service = createRoomService(database)
  if (!rateLimitSecret || rateLimitSecret.length < 32) throw new Error('서버 RATE_LIMIT_SECRET을 32자 이상으로 설정해주세요.')
  const bucketHash = async text => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(rateLimitSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}) }
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !allowedOrigins.includes(origin)) return respond({ error: '허용되지 않은 사이트입니다.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return respond({ error: '지원하지 않는 요청입니다.' }, 405)
    try {
      const text = await request.text()
      if (new TextEncoder().encode(text).length > 1048576) return respond({ error: '정산 데이터가 너무 큽니다.' }, 413)
      let payload
      try { payload = JSON.parse(text) } catch { return respond({ error: '요청 형식을 확인해주세요.' }, 400) }
      if (!payload || typeof payload !== 'object' || !['create', 'read', 'enter', 'unlock', 'save', 'revoke', 'list', 'delete', 'list-all', 'rename'].includes(payload.action)) return respond({ error: '지원하지 않는 요청입니다.' }, 400)
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const ipBucket = await bucketHash(ip)
      const allowed = await database.consumeLimit(`request:${ipBucket}`, 120, 60)
      if (!allowed) return respond({ error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' }, 429)
      if (payload.action === 'create') {
        if (!await database.consumeLimit(`create:${ipBucket}`, 5, 3600) || !await database.consumeLimit('create:global', 100, 3600)) return respond({ error: '정산방 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.' }, 429)
        return respond(await service.createRoom(payload), 201)
      }
      if (payload.action === 'revoke') { await service.revoke(payload.token); return respond({ ok: true }) }
      if (['read', 'enter', 'list'].includes(payload.action) && !await database.consumeLimit(`entry:${ipBucket}`, 30, 60)) return respond({ error: '방 코드 확인 요청이 많습니다. 잠시 후 다시 시도해주세요.' }, 429)
      if (payload.action === 'list') return respond(await service.listRooms(payload.roomCodes))
      if (payload.action === 'list-all') return respond(await service.listAllRooms(payload.offset ?? 0))
      const code = normalizeRoomCode(payload.roomCode)
      if (payload.action === 'unlock' || payload.action === 'delete' || payload.action === 'rename') {
        // Room-wide bucket cannot be bypassed by rotating/spoofing IP addresses.
        if (!await database.consumeLimit(`unlock:${code}`, 10, 300)) return respond({ error: '비밀번호 확인 횟수를 초과했습니다. 5분 후 다시 시도해주세요.' }, 429)
        if (payload.action === 'delete') { await service.deleteRoom(code, payload.token, payload.password); return respond({ ok: true }) }
        if (payload.action === 'rename') return respond(await service.renameRoom(code, payload.token, payload.password, payload.roomName, payload.icon))
        return respond(await service.unlock(code, payload.password))
      }
      if (payload.action === 'read') return respond(await service.getRoom(code))
      if (payload.action === 'enter') return respond(await service.enterRoom(payload.roomId, code))
      return respond(await service.saveSettlement(code, payload.token, payload.data, { settlementId: payload.settlementId, revision: payload.revision }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '정산방 요청에 실패했습니다.'
      const status = /비밀번호가 일치|관리자 비밀번호/.test(message) ? 401 : /찾을 수 없습니다/.test(message) ? 404 : /다른 화면/.test(message) ? 409 : /DB|fetch|network/i.test(message) ? 503 : 400
      return respond({ error: status === 503 ? '정산방 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' : message }, status)
    }
  }
}
