import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createRoomHandler } from '../server/roomHandler.js'
import { createLocalRoomDatabase } from '../src/rooms/localRoomRepository.js'
import { createSupabaseRoomRepository } from '../src/rooms/repository.js'
import { addMember, createSettlement } from '../src/settlement/model.js'
const password = 'test1234'
const origin = 'https://frontend.example'

test('cloud HTTP contract: separate clients read same room; server recomputes and enforces every write', async () => {
  const map = new Map(); const database = createLocalRoomDatabase({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) })
  const limits = new Map()
  database.consumeLimit = async (key, max) => { limits.set(key, (limits.get(key) ?? 0) + 1); return limits.get(key) <= max }
  const handler = createRoomHandler(database, { allowedOrigins: [origin], rateLimitSecret: 'test-only-secret-value-with-at-least-32-characters' })
  const request = payload => handler(new Request('https://db.example/functions/v1/room-api', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload) }))
  const fetcher = (url, init) => handler(new Request(url, { ...init, headers: { ...init.headers, Origin: origin } }))
  const admin = createSupabaseRoomRepository({ url: 'https://db.example', fetcher })
  const visitor = createSupabaseRoomRepository({ url: 'https://db.example', fetcher })
  const created = await admin.createRoom({ roomName: '공유 테스트 방', password })
  const code = created.room.roomCode
  assert.equal((await visitor.getRoom(code)).room.roomName, '공유 테스트 방')
  let data = addMember(createSettlement('normal/party'), '공대장')
  data.tries[0] = [{ id: 'drop', name: '아이템', amount: '7000000' }]
  assert.equal((await request({ action: 'save', roomCode: code, data, token: 'f'.repeat(64) })).status, 401)
  const saved = await admin.saveSettlement(code, created.token, data)
  assert.equal(saved.result.total.fee, '35000000')
  assert.equal((await visitor.getRoom(code)).settlements.length, 1)
  assert.ok(!JSON.stringify(await visitor.getRoom(code)).includes('adminPasswordHash'))
  await assert.rejects(visitor.unlock(code, 'wrong'), /비밀번호가 일치/)
  const authorized = await admin.unlock(code, password)
  data.members[0].name = '수정 이름'
  const updateResponse = await request({ action: 'save', roomCode: code, token: authorized.token, data, settlementId: saved.settlementId, revision: saved.revision, result: { total: { fee: '0' } } })
  assert.equal(updateResponse.status, 200); assert.equal((await updateResponse.json()).result.total.fee, '35000000')
  const stale = await request({ action: 'save', roomCode: code, token: authorized.token, data, settlementId: saved.settlementId, revision: saved.revision })
  assert.equal(stale.status, 409)
  const otherOrigin = await handler(new Request('https://db.example', { method: 'POST', headers: { Origin: 'https://bad.example' }, body: '{}' }))
  assert.equal(otherOrigin.status, 403)
  for (let index = 0; index < 8; index++) await request({ action: 'unlock', roomCode: code, password: 'wrong' })
  assert.equal((await request({ action: 'unlock', roomCode: code, password: 'wrong' })).status, 429)
  await admin.revoke(authorized.token)
  await assert.rejects(admin.saveSettlement(code, authorized.token, data), /관리자 비밀번호/)
  // No real Supabase network call is made by this contract test.
})

test('actual PostgreSQL migration: unique codes, atomic transactions, RLS/privileges, sessions and rate limits', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(await fs.readFile(new URL('../supabase/migrations/202609140001_rooms.sql', import.meta.url), 'utf8'))
    const id = crypto.randomUUID()
    const room = { roomId: id, roomCode: 'A7K3P9', roomName: 'SQL 공대', adminPasswordHash: { hash: 'server-only' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const session = { roomId: id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 600000).toISOString() }
    await db.query('select public.room_api_create($1::jsonb, $2::jsonb)', [JSON.stringify(room), JSON.stringify(session)])
    assert.equal((await db.query('select room_name from public.settlement_rooms')).rows[0].room_name, 'SQL 공대')
    await assert.rejects(db.query('select public.room_api_create($1::jsonb, $2::jsonb)', [JSON.stringify({ ...room, roomId: crypto.randomUUID() }), JSON.stringify(session)]), /duplicate key/)
    const badRoom = { ...room, roomId: crypto.randomUUID(), roomCode: 'B7K3P9' }
    await assert.rejects(db.query('select public.room_api_create($1::jsonb, $2::jsonb)', [JSON.stringify(badRoom), JSON.stringify({ ...session, roomId: badRoom.roomId, tokenHash: 'bad' })]), /check constraint/)
    assert.equal((await db.query('select count(*)::int as count from public.settlement_rooms')).rows[0].count, 1, 'failed session insert rolls back room creation')
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const table of ['settlement_rooms', 'room_settlements', 'room_admin_sessions', 'room_api_limits']) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/)
      await assert.rejects(db.query('select public.room_api_create($1::jsonb, $2::jsonb)', [JSON.stringify(room), JSON.stringify(session)]), /permission denied/)
      await assert.rejects(db.query('select public.room_api_save($1::jsonb, null)', ['{}']), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await db.query('select * from public.room_admin_sessions')).rows.length, 1)
    const record = { settlementId: crypto.randomUUID(), roomId: id, data: {}, result: {}, createdAt: room.createdAt, updatedAt: room.updatedAt }
    await db.query('select public.room_api_save($1::jsonb, null)', [JSON.stringify(record)])
    await db.query('select public.room_api_save($1::jsonb, 1)', [JSON.stringify(record)])
    await assert.rejects(db.query('select public.room_api_save($1::jsonb, 1)', [JSON.stringify(record)]), /Revision conflict/)
    assert.equal((await db.query('select revision from public.room_settlements')).rows[0].revision, 2)
    for (const expected of [true, true, false]) assert.equal((await db.query("select public.room_api_consume_limit('test', 2, 300) as allowed")).rows[0].allowed, expected)
    await db.exec('reset role')
    const enabled = (await db.query("select relrowsecurity from pg_class where relname in ('settlement_rooms','room_settlements','room_admin_sessions','room_api_limits')")).rows
    assert.equal(enabled.length, 4); assert.ok(enabled.every(row => row.relrowsecurity))
  } finally { await db.close() }
})
