import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalRoomDatabase } from '../src/rooms/localRoomRepository.js'
import { createRoomService } from '../src/rooms/roomService.js'
import { createSupabaseRoomRepository } from '../src/rooms/repository.js'
import { createRoomHandler } from '../server/roomHandler.js'
import { addMember, createSettlement } from '../src/settlement/model.js'
import { visitedRooms } from '../src/rooms/visitedRooms.js'

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
const setup = () => {
  const db = createLocalRoomDatabase(storage()); db.consumeLimit = async () => true
  const handler = createRoomHandler(db, { rateLimitSecret: 'test-secret-at-least-32-characters-long' })
  const client = () => createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher: (url, options) => handler(new Request(url, options)) })
  return { db, handler, admin: client(), viewer: client() }
}

for (const variant of ['name', 'icon', 'both']) test(`metadata ${variant}: server persists changes without modifying code, authentication or settlements`, async () => {
  const { db, admin, viewer } = setup()
  const created = await admin.createRoom({ roomName: 'original', password: 'abcd', icon: '🍁' })
  const code = created.room.roomCode
  const saved = await admin.saveSettlement(code, created.token, addMember(createSettlement('normal/party'), 'Member', 'm'))
  const before = await db.findRoom(code)
  const name = variant === 'icon' ? 'original' : 'updated'
  const icon = variant === 'name' ? undefined : '🍀'
  await assert.rejects(admin.renameRoom(code, undefined, 'abcd', name, icon), /관리자/)
  await assert.rejects(admin.renameRoom(code, created.token, 'wrong', name, icon), /비밀번호/)
  await assert.rejects(admin.renameRoom(code, created.token, 'abcd', name, 'invalid'), /아이콘/)
  await admin.renameRoom(code, created.token, 'abcd', name, icon)
  const read = await viewer.getRoom(code)
  assert.deepEqual(read.settlements, [saved])
  assert.equal(read.room.roomName, name); assert.equal(read.room.icon, icon ?? '🍁')
  assert.deepEqual(await db.findRoom(code), { ...before, roomName: name, icon: icon ?? '🍁' })
  assert.equal((await viewer.listAllRooms()).rooms[0].icon, icon ?? '🍁')
  assert.equal((await viewer.listRooms([code]))[0].icon, icon ?? '🍁')
})

test('public API only returns directory metadata; missing/wrong/another-room code never returns details', async () => {
  const { admin, viewer, handler, db } = setup()
  const a = await admin.createRoom({ roomName: 'A', password: 'abcd' })
  const b = await admin.createRoom({ roomName: 'B', password: 'abcd' })
  const saved = await admin.saveSettlement(a.room.roomCode, a.token, addMember(createSettlement('normal/party'), 'Private participant', 'm'))
  const list = await viewer.listAllRooms()
  assert.equal(list.rooms.length, 2)
  for (const row of list.rooms) assert.deepEqual(Object.keys(row).sort(), ['roomId', 'roomName', 'icon', 'createdAt', 'latestSettlementDate'].sort())
  assert.ok(!JSON.stringify(list).includes(a.room.roomCode)); assert.ok(!JSON.stringify(list).includes(b.room.roomCode))
  assert.doesNotMatch(JSON.stringify(list), /Private participant|settlementId|password|hash|token|members|amount|result|room_code|roomCode/i)
  let detailsRead = 0
  const listSettlements = db.listSettlements
  db.listSettlements = async id => { detailsRead++; return listSettlements(id) }
  for (const code of [undefined, '', '???', '000000', b.room.roomCode]) {
    const response = await handler(new Request('https://example.supabase.co/functions/v1/room-api', { method: 'POST', body: JSON.stringify({ action: 'enter', roomId: a.room.roomId, roomCode: code }) }))
    assert.ok(response.status >= 400)
    assert.deepEqual(Object.keys(await response.json()), ['error'])
  }
  assert.equal(detailsRead, 0, 'reject before fetching settlements')
  await assert.rejects(viewer.enterRoom(undefined, a.room.roomCode), /선택/)
  await assert.rejects(viewer.getRoom(undefined), /6자리/)
  assert.equal((await viewer.enterRoom(a.room.roomId, a.room.roomCode)).settlements[0].settlementId, saved.settlementId)
  assert.equal((await viewer.getRoom(a.room.roomCode)).settlements[0].settlementId, saved.settlementId, 'direct share links still use known code')
})

test('browser A visit does not populate browser B; listing alone never creates visits', async () => {
  const { admin, viewer } = setup()
  const a = visitedRooms(storage(), 'supabase'), b = visitedRooms(storage(), 'supabase')
  const created = await admin.createRoom({ roomName: 'room', password: 'abcd' })
  await viewer.listAllRooms()
  assert.deepEqual(a.read(), []); assert.deepEqual(b.read(), [])
  await viewer.getRoom(created.room.roomCode); a.remember(created.room.roomCode)
  assert.equal((await viewer.listRooms(a.read())).length, 1)
  assert.deepEqual(await viewer.listRooms(b.read()), [])
  await assert.rejects(viewer.enterRoom(created.room.roomId, '000000'))
  assert.deepEqual(b.read(), [])
})

test('legacy no-icon room still reads maple fallback; metadata update preserves session expiry enforcement', async () => {
  const { db, admin } = setup()
  const created = await admin.createRoom({ roomName: 'legacy', password: 'abcd' })
  const originalFind = db.findRoom
  db.findRoom = async code => { const room = await originalFind(code); if (room) delete room.icon; return room }
  const service = createRoomService(db)
  assert.equal((await service.getRoom(created.room.roomCode)).room.icon, '🍁')
  await admin.revoke(created.token)
  await assert.rejects(admin.renameRoom(created.room.roomCode, created.token, 'abcd', 'legacy', '🍀'), /관리자/)
})
