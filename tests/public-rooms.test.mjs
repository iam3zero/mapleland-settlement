import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createLocalRoomDatabase } from '../src/rooms/localRoomRepository.js'
import { createRoomService } from '../src/rooms/roomService.js'
import { createRoomHandler } from '../server/roomHandler.js'
import { createSupabaseRoomRepository } from '../src/rooms/repository.js'
import { addMember, createSettlement } from '../src/settlement/model.js'
import { tokenHash, roomLink } from '../src/rooms/domain.js'

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const draft = () => addMember(createSettlement('normal/party'), '공대장', 'leader')

test('rename verifies password and room session, preserves records, code, hashes and timestamps', async () => {
  const db = createLocalRoomDatabase(memory()); const service = createRoomService(db)
  const room = await service.createRoom({ roomName: '원래 이름', password: 'abcd' })
  await service.saveSettlement(room.room.roomCode, room.token, draft())
  const before = await service.getRoom(room.room.roomCode)
  const privateBefore = await db.findRoom(room.room.roomCode)
  await assert.rejects(service.renameRoom(room.room.roomCode, room.token, 'bad', '실패'), /비밀번호가 일치/)
  await assert.rejects(service.renameRoom(room.room.roomCode, room.token, 'abcd', '  '), /1~60/)
  const extra = await service.unlock(room.room.roomCode, 'abcd')
  await db.insertSession({ tokenHash: await tokenHash(extra.token), roomId: room.room.roomId, expiresAt: '2000-01-01T00:00:00Z' })
  await assert.rejects(service.renameRoom(room.room.roomCode, extra.token, 'abcd', '실패'), /관리자/)
  await service.renameRoom(room.room.roomCode, room.token, 'abcd', ' 변경된 이름 ')
  const after = await service.getRoom(room.room.roomCode)
  assert.equal(after.room.roomName, '변경된 이름')
  assert.deepEqual(after.settlements, before.settlements)
  assert.deepEqual(await db.findRoom(room.room.roomCode), { ...privateBefore, roomName: '변경된 이름' })
  assert.equal((await service.listRooms([room.room.roomCode]))[0].roomName, '변경된 이름')
})

test('public HTTP directory is independent of visits; separate clients see creates, renames and deletes without secrets', async () => {
  const db = createLocalRoomDatabase(memory()); db.consumeLimit = async () => true
  const handler = createRoomHandler(db, { rateLimitSecret: 'test-secret-at-least-32-characters-long' })
  const fetcher = (url, options) => handler(new Request(url, options))
  const admin = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const viewer = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const room = await admin.createRoom({ roomName: '공유방', password: 'abcd', icon: '🍀' })
  assert.deepEqual(await viewer.listRooms([]), [])
  assert.equal((await viewer.listAllRooms()).rooms[0].roomName, '공유방')
  await assert.rejects(viewer.renameRoom(room.room.roomCode, room.token, 'wrong', '실패'), /비밀번호가 일치/)
  await admin.renameRoom(room.room.roomCode, room.token, 'abcd', '새 이름')
  const list = await viewer.listAllRooms()
  assert.equal(list.rooms[0].roomName, '새 이름'); assert.equal(list.rooms[0].icon, '🍀')
  assert.equal((await viewer.getRoom(room.room.roomCode)).room.roomName, '새 이름')
  assert.doesNotMatch(JSON.stringify(list), /password|hash|token|secret|abcd/i)
  await assert.rejects(viewer.listAllRooms(-1), /페이지/)
  await admin.deleteRoom(room.room.roomCode, room.token, 'abcd')
  assert.deepEqual((await viewer.listAllRooms()).rooms, [])
})

test('public pagination returns thirty safe summaries and hasMore', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({ roomId: String(index), roomName: '방', roomCode: 'ABC234', adminPasswordHash: 'secret' }))
  const service = createRoomService({ listAllRooms: async offset => rows.slice(offset) })
  const first = await service.listAllRooms(); assert.equal(first.rooms.length, 30); assert.equal(first.hasMore, true)
  assert.equal(first.rooms[0].icon, '🍁'); assert.doesNotMatch(JSON.stringify(first), /secret|adminPasswordHash/)
  const second = await service.listAllRooms(30); assert.equal(second.rooms.length, 1); assert.equal(second.hasMore, false)
})

test('SQL public ordering, permissions, rename and unique code update preserve original data and authentication', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    for (const file of ['202609140001_rooms.sql', '202609160001_room_icons_delete.sql', '202609160002_public_rooms_rename.sql']) await db.exec(await fs.readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    const room = { roomId: crypto.randomUUID(), roomCode: 'ABC234', roomName: '축캐 자쿰 외판공대', adminPasswordHash: { hash: 'secret' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
    const session = { roomId: room.roomId, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 600000).toISOString() }
    await db.query('select public.room_api_create($1,$2)', [room, session])
    const other = { ...room, roomId: crypto.randomUUID(), roomCode: 'DEF567', roomName: 'other', createdAt: '2026-02-01T00:00:00Z' }
    await db.query('select public.room_api_create($1,$2)', [other, { ...session, roomId: other.roomId, tokenHash: 'b'.repeat(64) }])
    const record = { settlementId: crypto.randomUUID(), roomId: room.roomId, data: { date: '2025-01-01' }, result: {}, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }
    await db.query('select public.room_api_save($1,null)', [record])
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from public.room_api_list_all(0)'), /permission denied/)
      await assert.rejects(db.query('select public.room_api_rename($1,$2,$3)', [room.roomId, session.tokenHash, 'bad']), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    const rows = (await db.query('select * from public.room_api_list_all(0)')).rows
    assert.equal(rows[0].room_id, room.roomId, 'uses record updated_at, not its settlement date')
    assert.equal(rows[1].last_activity_at.toISOString(), other.createdAt.replace('Z', '.000Z'))
    assert.doesNotMatch(JSON.stringify(rows), /secret|password|token|hash/i)
    const before = (await db.query('select * from public.settlement_rooms where room_id=$1', [room.roomId])).rows[0]
    const recordsBefore = (await db.query('select * from public.room_settlements')).rows
    const sessionsBefore = (await db.query('select * from public.room_admin_sessions order by token_hash')).rows
    await assert.rejects(db.query('select public.room_api_rename($1,$2,$3)', [room.roomId, 'x'.repeat(64), 'bad']), /invalid admin session/)
    await db.query('select public.room_api_rename($1,$2,$3)', [room.roomId, session.tokenHash, '새 이름'])
    assert.deepEqual((await db.query('select * from public.settlement_rooms where room_id=$1', [room.roomId])).rows[0], { ...before, room_name: '새 이름' })
    await db.query("update public.settlement_rooms set room_code='18PMMM' where room_id=$1", [room.roomId])
    await assert.rejects(db.query("update public.settlement_rooms set room_code='18PMMM' where room_id=$1", [other.roomId]), /unique/)
    assert.equal((await db.query("select room_id from public.settlement_rooms where room_code='18PMMM'")).rows[0].room_id, room.roomId)
    assert.equal((await db.query("select room_id from public.settlement_rooms where room_code='ABC234'")).rows.length, 0)
    assert.equal(roomLink('18PMMM', 'https://example.com'), 'https://example.com/#/room/18PMMM')
    assert.deepEqual((await db.query('select * from public.room_settlements')).rows, recordsBefore)
    assert.deepEqual((await db.query('select * from public.room_admin_sessions order by token_hash')).rows, sessionsBefore)
    await db.query('select public.room_api_delete($1,$2)', [room.roomId, session.tokenHash])
    assert.equal((await db.query('select * from public.room_api_list_all(0)')).rows.length, 1)
  } finally { await db.close() }
})
