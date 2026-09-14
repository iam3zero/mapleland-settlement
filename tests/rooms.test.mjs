import test from 'node:test'
import assert from 'node:assert/strict'
import { koreanMeso } from '../src/settlement/koreanMeso.js'
import { addMember, calculateSettlement, createSettlement, migrateSettlement, setParticipant, serializable, validateDraft } from '../src/settlement/model.js'
import { createRecordRepository, RECORDS_KEY } from '../src/settlement/records.js'
import { protectPassword } from '../src/settlement/auth.js'
import { createLocalRoomDatabase, ROOMS_KEY } from '../src/rooms/localRoomRepository.js'
import { createRoomService } from '../src/rooms/roomService.js'
import { normalizeRoomCode, roomCode, roomLink } from '../src/rooms/domain.js'
import { configureRoomRepository } from '../src/rooms/repository.js'

const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) } }
function draft() { const data = addMember(createSettlement('normal/party'), '공대장'); data.tries[0] = [{ id: 'drop', name: '자쿰의 투구', amount: '7000000' }]; return data }
const password = 'room-test-password'

for (const [amount, expected] of [[1000000n, '100만'], [10000000n, '1천만'], [100000000n, '1억'], [850000000n, '8억 5천'], [1250000000n, '12억 5천'], [1000000000000n, '1조'], [141666667n, '약 1억 4,166만']]) {
  test(`Korean amount ${amount} => ${expected}`, () => assert.equal(koreanMeso(amount * 100n), expected))
}
test('Korean helpers never affect precise BigInt values, including sub-meso and large totals', () => {
  assert.equal(koreanMeso(0n), ''); assert.equal(koreanMeso(null), ''); assert.equal(koreanMeso(5n), '1메소 미만')
  const data = draft(); data.tries[0] = Array.from({ length: 20 }, (_, index) => ({ id: String(index), name: '아이템', amount: '999999999999' }))
  const result = calculateSettlement(data)
  assert.equal(result.total.gross, 1999999999998000n)
  assert.equal(result.total.fee, 99999999999900n)
  assert.equal(result.individuals[0].total + result.remainder, result.total.net)
  const before = result.total.final; koreanMeso(before); assert.equal(result.total.final, before)
})
test('chaos keeps two raid-wide trials; a party accident cannot transfer funds to other parties', () => {
  let data = createSettlement('chaos/party')
  for (let party = 1; party <= 5; party++) for (let index = 0; index < 2; index++) data = addMember(data, `P${party}-${index}`, `${party}-${index}`, party)
  data = addMember(data, '기타', 'other', 0)
  data.tries = [[{ id: 'one', name: '아이템', amount: '22000000' }], [{ id: 'two', name: '아이템', amount: '22000000' }]]
  const before = calculateSettlement(data)
  data = setParticipant(data, 0, '1-0', { penalty: 100 })
  data = setParticipant(data, 0, '2-0', { penalty: 50 })
  const after = calculateSettlement(data)
  assert.equal(after.trials.length, 2); assert.equal(after.count, 11)
  assert.deepEqual(after.trials[1], before.trials[1])
  for (const party of [1, 2, 3, 4, 5]) {
    const sum = trial => trial.rows.filter(row => row.party === party).reduce((total, row) => total + row.amount, 0n)
    assert.equal(sum(after.trials[0]), sum(before.trials[0]))
  }
  assert.equal(after.trials[0].rows.find(row => row.id === '1-0').amount, 0n)
  assert.equal(after.trials[0].rows.find(row => row.id === '1-1').amount, 380000000n)
  for (const id of ['3-0', '4-0', '5-0', 'other']) assert.equal(after.trials[0].rows.find(row => row.id === id).amount, before.trials[0].rows.find(row => row.id === id).amount)
  assert.equal(after.trials[0].rows.reduce((sum, row) => sum + row.finalPoints, 0), 10000)
  data = setParticipant(data, 0, '1-1', { penalty: 50 })
  assert.match(calculateSettlement(data).trials[0].error, /정상 1파티/)
})
test('version-1 history stays readable and byte-for-byte intact; editing maps old other party to zero', async () => {
  let data = createSettlement('chaos/party'); data.version = 1
  data = addMember(addMember(data, '공대장', 'a', 1), '기타', 'b', 2)
  data.tries[0] = [{ id: 'drop', name: '자쿰의 투구', amount: '7000000' }]
  const memory = storage()
  const record = { id: 'old-record', revision: 1, createdAt: new Date().toISOString(), savedAt: new Date().toISOString(), protection: await protectPassword(password), data, result: serializable(calculateSettlement(data)) }
  const raw = JSON.stringify({ version: 1, records: [record] }); memory.setItem(RECORDS_KEY, raw)
  const old = createRecordRepository(memory).get('old-record')
  const migrated = migrateSettlement(old.data)
  assert.equal(migrated.version, 2); assert.equal(migrated.members[1].party, 0)
  assert.equal(memory.getItem(RECORDS_KEY), raw); assert.equal(old.data.members[1].party, 2)
  assert.equal(calculateSettlement(migrated).individuals[1].total, calculateSettlement(data).individuals[1].total)
  validateDraft(migrated)
})
test('six-character codes, normalization and share URL generation', () => {
  for (let i = 0; i < 100; i++) assert.match(roomCode(), /^[A-Z0-9]{6}$/)
  assert.equal(normalizeRoomCode(' a7k3p9 '), 'A7K3P9')
  assert.throws(() => normalizeRoomCode('abc'))
  assert.equal(roomLink('a7k3p9', 'https://example.com'), 'https://example.com/#/room/A7K3P9')
})
test('room creation saves name, hides hash on public reads and retries duplicate code atomically', async () => {
  const memory = storage(); const database = createLocalRoomDatabase(memory)
  const codes = ['ABC234', 'ABC234', 'DEF567']
  const service = createRoomService(database, { generateCode: () => codes.shift() })
  const first = await service.createRoom({ roomName: '첫 공대', password })
  const second = await service.createRoom({ roomName: '두 번째 공대', password })
  assert.equal(first.room.roomCode, 'ABC234'); assert.equal(second.room.roomCode, 'DEF567')
  const publicRead = await service.getRoom('ABC234')
  assert.equal(publicRead.room.roomName, '첫 공대')
  assert.equal(publicRead.room.adminPasswordHash, undefined); assert.ok(!JSON.stringify(publicRead).includes(password))
  assert.equal(createRecordRepository(memory).list().length, 0)
  assert.ok(memory.getItem(ROOMS_KEY)); assert.equal(memory.getItem(RECORDS_KEY), null)
})
test('rooms own multiple settlements; wrong password, anonymous and cross-room writes are blocked', async () => {
  const service = createRoomService(createLocalRoomDatabase(storage()))
  const a = await service.createRoom({ roomName: 'A공대', password }); const b = await service.createRoom({ roomName: 'B공대', password })
  await assert.rejects(service.unlock(a.room.roomCode, 'wrong'), /비밀번호가 일치/)
  await assert.rejects(service.saveSettlement(a.room.roomCode, '', draft()), /관리자 비밀번호/)
  await assert.rejects(service.saveSettlement(b.room.roomCode, a.token, draft()), /관리자 비밀번호/)
  const first = await service.saveSettlement(a.room.roomCode, a.token, draft())
  await service.saveSettlement(a.room.roomCode, a.token, draft())
  assert.equal((await service.getRoom(a.room.roomCode)).settlements.length, 2)
  assert.equal((await service.getRoom(b.room.roomCode)).settlements.length, 0)
  const access = await service.unlock(a.room.roomCode, password)
  const changed = structuredClone(first.data); changed.members[0].name = '수정 공대장'
  const updated = await service.saveSettlement(a.room.roomCode, access.token, changed, { settlementId: first.settlementId, revision: 1 })
  assert.equal(updated.revision, 2); assert.equal(updated.data.members[0].name, '수정 공대장')
  await assert.rejects(service.saveSettlement(a.room.roomCode, access.token, changed, { settlementId: first.settlementId, revision: 1 }), /다른 화면/)
  await service.revoke(access.token)
  await assert.rejects(service.saveSettlement(a.room.roomCode, access.token, draft()), /관리자 비밀번호/)
})
test('expired grants and reload cannot bypass admin verification; saved room data survives reload', async () => {
  const memory = storage(); let current = new Date()
  const service = createRoomService(createLocalRoomDatabase(memory), { now: () => current })
  const room = await service.createRoom({ roomName: '영속 방', password })
  await service.saveSettlement(room.room.roomCode, room.token, draft())
  current = new Date(current.getTime() + 16 * 60 * 1000)
  await assert.rejects(service.saveSettlement(room.room.roomCode, room.token, draft()), /관리자 비밀번호/)
  const reloaded = createRoomService(createLocalRoomDatabase(memory))
  assert.equal((await reloaded.getRoom(room.room.roomCode)).settlements.length, 1)
  await assert.rejects(reloaded.saveSettlement(room.room.roomCode, room.token, draft()), /관리자 비밀번호/)
})
test('cloud configuration never silently saves to localStorage after missing config or network error', async () => {
  const memory = storage()
  assert.throws(() => configureRoomRepository({ VITE_ROOM_STORAGE: 'supabase' }, memory), /URL/)
  const cloud = configureRoomRepository({ VITE_ROOM_STORAGE: 'supabase', VITE_SUPABASE_URL: 'https://example.supabase.co' }, memory, async () => { throw new Error('offline') })
  await assert.rejects(cloud.service.createRoom({ roomName: '새 방', password }), /로컬로 대신/)
  assert.equal(memory.getItem(ROOMS_KEY), null)
})
