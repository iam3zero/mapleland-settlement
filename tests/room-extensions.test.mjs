import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { addMember, calculateSettlement, createSettlement, migrateSettlement, validateForSave } from '../src/settlement/model.js'
import { bossItems, itemsForBoss, saleStatus } from '../src/settlement/bossItems.js'
import { MOCK_ITEMS } from '../src/settlement/calculations.js'
import { createRoomService } from '../src/rooms/roomService.js'
import { createLocalRoomDatabase, ROOMS_KEY } from '../src/rooms/localRoomRepository.js'
import { createSupabaseRoomRepository } from '../src/rooms/repository.js'
import { createRoomHandler } from '../server/roomHandler.js'
import { publicRoom, tokenHash } from '../src/rooms/domain.js'
import { visitedRooms } from '../src/rooms/visitedRooms.js'
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const draft = (mode = 'normal/party') => {
  const data = addMember(createSettlement(mode), '공대장', 'leader')
  data.tries[0] = [{ id: 'pending', name: '자쿰의 투구', amount: '' }, { id: 'sold', name: '판매 아이템', amount: '1000000' }]
  return data
}

for (const mode of ['normal/party', 'chaos/party']) test(`${mode}: name-only registration, pending exclusion, completion and clearing recalculate correctly`, () => {
  const data = draft(mode)
  assert.equal(saleStatus(data.tries[0][0].amount), 'pending')
  assert.equal(validateForSave(data).total.gross, 100000000n)
  data.tries[0][0].amount = '500000'
  assert.equal(saleStatus(data.tries[0][0].amount), 'sold')
  assert.equal(validateForSave(data).total.net, 142500000n)
  data.tries[0][0].amount = ''
  assert.equal(validateForSave(data).total.net, 95000000n)
  assert.equal(saleStatus('0'), 'sold', 'an explicitly entered zero differs from an empty amount')
  const normalized = migrateSettlement(data)
  assert.equal(normalized.tries[0][0].saleStatus, 'pending')
  assert.equal(data.tries[0][0].saleStatus, undefined, 'old inputs are not mutated')
  assert.equal(calculateSettlement(normalized).total.net, calculateSettlement(data).total.net)
})

test('boss catalogs are separate internal provisional lists, with no invented drops', () => {
  assert.notEqual(bossItems.normalZakum, bossItems.chaosZakum)
  for (const mode of ['normal/party', 'chaos/party']) {
    assert.deepEqual(itemsForBoss(mode), MOCK_ITEMS)
    assert.ok(itemsForBoss(mode).filter(item => item.includes('자쿰')).includes('자쿰의 투구'))
  }
})

test('icons default safely, summaries are recent-first, known-code-only and exclude all secrets', async () => {
  const memory = storage(); const db = createLocalRoomDatabase(memory); const service = createRoomService(db)
  const a = await service.createRoom({ roomName: 'A', password: 'abcd' })
  const b = await service.createRoom({ roomName: 'B', password: 'abcd', icon: '🐸' })
  assert.equal(a.room.icon, '🍁'); assert.equal(b.room.icon, '🐸')
  assert.equal(publicRoom({ roomName: 'old' }).icon, '🍁')
  const old = draft(); old.date = '2026-09-15'
  const latest = draft(); latest.date = '2026-09-16'
  await service.saveSettlement(a.room.roomCode, a.token, old)
  await service.saveSettlement(b.room.roomCode, b.token, latest)
  const list = await service.listRooms([a.room.roomCode, b.room.roomCode])
  assert.deepEqual(list.map(room => room.roomName), ['B', 'A'])
  assert.equal(list[0].latestSettlementDate, '2026-09-16')
  assert.equal((await service.listRooms([a.room.roomCode])).length, 1)
  assert.deepEqual(await service.listRooms([]), [])
  assert.doesNotMatch(JSON.stringify(list), /adminPasswordHash|token|hash|abcd/)
  await assert.rejects(service.listRooms(Array(31).fill(a.room.roomCode)), /30/)
  await assert.rejects(service.createRoom({ roomName: 'Bad', password: 'abcd', icon: '<script>' }), /아이콘/)
  const raw = JSON.parse(memory.getItem(ROOMS_KEY)); delete raw.rooms[0].icon; memory.setItem(ROOMS_KEY, JSON.stringify(raw))
  assert.equal((await service.getRoom(a.room.roomCode)).room.icon, '🍁')
})

test('visited shortcuts persist only codes, stay mode-specific, deduplicate and forget deleted rooms', () => {
  const memory = storage(); const known = visitedRooms(memory, 'supabase')
  known.remember('ABC234'); known.remember('DEF567'); known.remember('ABC234')
  assert.deepEqual(known.read(), ['ABC234', 'DEF567'])
  assert.deepEqual(visitedRooms(memory, 'local').read(), [])
  known.forget('ABC234'); assert.deepEqual(visitedRooms(memory, 'supabase').read(), ['DEF567'])
})

test('delete requires password and unexpired room session, then removes only that room and its records/sessions', async () => {
  const memory = storage(); const db = createLocalRoomDatabase(memory); const service = createRoomService(db)
  const a = await service.createRoom({ roomName: 'A', password: 'abcd' })
  const b = await service.createRoom({ roomName: 'B', password: 'abcd' })
  await service.saveSettlement(a.room.roomCode, a.token, draft())
  const extra = await service.unlock(a.room.roomCode, 'abcd')
  await assert.rejects(service.deleteRoom(a.room.roomCode, b.token, 'abcd'), /관리자/)
  await assert.rejects(service.deleteRoom(a.room.roomCode, a.token, 'wrong'), /비밀번호가 일치/)
  const hash = await tokenHash(extra.token)
  await db.insertSession({ tokenHash: hash, roomId: a.room.roomId, expiresAt: '2000-01-01T00:00:00Z' })
  await assert.rejects(service.deleteRoom(a.room.roomCode, extra.token, 'abcd'), /관리자/)
  assert.equal((await service.getRoom(a.room.roomCode)).settlements.length, 1)
  await service.deleteRoom(a.room.roomCode, a.token, 'abcd')
  await assert.rejects(service.getRoom(a.room.roomCode), /찾을 수 없습니다/)
  assert.equal(await db.getSession(await tokenHash(a.token)), null)
  assert.equal(await db.getSession(hash), null)
  assert.equal((await db.listSettlements(a.room.roomId)).length, 0)
  assert.equal((await service.getRoom(b.room.roomCode)).room.roomName, 'B')
})

test('two HTTP clients see identical icon, pending/sold state and summaries; authenticated deletion becomes 404', async () => {
  const db = createLocalRoomDatabase(storage()); db.consumeLimit = async () => true
  const handler = createRoomHandler(db, { rateLimitSecret: 'test-secret-at-least-32-characters-long' })
  const fetcher = (url, options) => handler(new Request(url, options))
  const admin = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const viewer = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const a = await admin.createRoom({ roomName: '공유', password: 'abcd', icon: '🍄' })
  const saved = await admin.saveSettlement(a.room.roomCode, a.token, draft())
  let read = await viewer.getRoom(a.room.roomCode)
  assert.equal(read.room.icon, '🍄')
  assert.equal(read.settlements[0].data.tries[0][0].saleStatus, 'pending')
  const next = read.settlements[0].data; next.tries[0][0].amount = '500000'
  await admin.saveSettlement(a.room.roomCode, a.token, next, { settlementId: saved.settlementId, revision: saved.revision })
  read = await viewer.getRoom(a.room.roomCode)
  assert.equal(read.settlements[0].data.tries[0][0].saleStatus, 'sold')
  assert.equal(read.settlements[0].result.total.net, '142500000')
  assert.equal((await viewer.listRooms([a.room.roomCode]))[0].icon, '🍄')
  await assert.rejects(viewer.deleteRoom(a.room.roomCode, a.token, 'bad'), /비밀번호가 일치/)
  await admin.deleteRoom(a.room.roomCode, a.token, 'abcd')
  assert.deepEqual(await viewer.listRooms([a.room.roomCode]), [])
  await assert.rejects(viewer.getRoom(a.room.roomCode), /찾을 수 없습니다/)
})

test('SQL additive icon migration, public summary whitelist, permission checks and atomic cascading delete', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(await fs.readFile(new URL('../supabase/migrations/202609140001_rooms.sql', import.meta.url), 'utf8'))
    const room = { roomId: crypto.randomUUID(), roomCode: 'ABC234', roomName: 'legacy', adminPasswordHash: { hash: 'secret' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const session = { roomId: room.roomId, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 600000).toISOString() }
    await db.query('select public.room_api_create($1, $2)', [room, session])
    await db.exec(await fs.readFile(new URL('../supabase/migrations/202609160001_room_icons_delete.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query('select icon from public.settlement_rooms')).rows[0].icon, null)
    const record = { settlementId: crypto.randomUUID(), roomId: room.roomId, data: { date: '2026-09-16' }, result: {}, createdAt: room.createdAt, updatedAt: room.updatedAt }
    await db.query('select public.room_api_save($1, null)', [record])
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from public.room_api_list_known($1)', [[room.roomCode]]), /permission denied/)
      await assert.rejects(db.query('select public.room_api_delete($1,$2)', [room.roomId, session.tokenHash]), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    const list = (await db.query('select * from public.room_api_list_known($1)', [[room.roomCode]])).rows
    assert.equal(list[0].latest_settlement_date, '2026-09-16')
    assert.equal(list[0].admin_password_hash, undefined)
    await assert.rejects(db.query('select public.room_api_delete($1,$2)', [room.roomId, 'b'.repeat(64)]), /invalid admin session/)
    await db.query('update public.room_admin_sessions set expires_at = now() - interval \'1 second\'')
    await assert.rejects(db.query('select public.room_api_delete($1,$2)', [room.roomId, session.tokenHash]), /invalid admin session/)
    await db.query("update public.room_admin_sessions set expires_at = now() + interval '10 minutes'")
    await db.query('select public.room_api_delete($1,$2)', [room.roomId, session.tokenHash])
    for (const table of ['settlement_rooms', 'room_settlements', 'room_admin_sessions']) assert.equal((await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count, 0)
  } finally { await db.close() }
})
