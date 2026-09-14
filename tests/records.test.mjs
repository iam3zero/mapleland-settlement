import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecordRepository, RECORDS_KEY } from '../src/settlement/records.js'
import { addMember, createSettlement, setManualRatio, setParticipant } from '../src/settlement/model.js'
import { protectPassword, verifyPassword } from '../src/settlement/auth.js'
const PASSWORD = 'test-only-passphrase'
function memoryStorage(initial) {
  const values = new Map(initial)
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
function fixture(mode = 'normal/raid') {
  let data = addMember(addMember(createSettlement(mode), '공대장', 'leader'), '비숍', 'bishop')
  if (mode.endsWith('raid')) {
    data.tries[0][0] = { ...data.tries[0][0], amount: '7000000', included: true }
    data.tries[1][0] = { ...data.tries[1][0], amount: '14000000', included: true }
    data.res = ['1000000', '2000000']
  } else data.tries[0] = [{ id: 'item', name: '자쿰의 투구', amount: '7000000' }]
  return setParticipant(setManualRatio(data, 0, 'leader', '30'), 0, 'leader', { penalty: 50 })
}

test('reload preserves all inputs, ratio/death settings, results and history without plaintext password', async () => {
  const storage = memoryStorage(); const repo = createRecordRepository(storage); const data = fixture()
  const saved = await repo.create(data, PASSWORD)
  const reload = createRecordRepository(storage)
  assert.deepEqual(reload.get(saved.id).data, data); assert.deepEqual(reload.get(saved.id).result, saved.result)
  assert.equal(reload.list().length, 1); assert.equal(saved.result.total.fee, '105000000')
  assert.equal(saved.result.trials[0].rows[0].penalty, 50)
  assert.ok(!storage.getItem(RECORDS_KEY).includes(PASSWORD))
  data.members[0].name = 'changed'; assert.equal(reload.get(saved.id).data.members[0].name, '공대장')
})
test('wrong password and forged permission cannot modify a record', async () => {
  const storage = memoryStorage(); const repo = createRecordRepository(storage)
  const record = await repo.create(fixture(), PASSWORD); const before = storage.getItem(RECORDS_KEY)
  await assert.rejects(repo.unlock(record.id, 'incorrect'), /비밀번호가 일치하지 않습니다/)
  assert.throws(() => repo.update(record.id, fixture(), {}), /먼저 확인/)
  assert.equal(storage.getItem(RECORDS_KEY), before)
})
test('correct password permits saving edits once; identity and password protection persist after reload', async () => {
  const storage = memoryStorage(); const repo = createRecordRepository(storage)
  const original = await repo.create(fixture(), PASSWORD)
  const { permit, record } = await repo.unlock(original.id, PASSWORD)
  record.data.members[0].name = '수정한 공대장'; record.data.res[0] = '500000'
  const updated = repo.update(record.id, record.data, permit)
  assert.equal(updated.id, original.id); assert.equal(updated.revision, 2)
  assert.deepEqual(updated.protection, original.protection)
  assert.equal(createRecordRepository(storage).get(record.id).data.res[0], '500000')
  assert.throws(() => repo.update(record.id, record.data, permit), /먼저 확인/)
  assert.throws(() => createRecordRepository(storage).update(record.id, record.data, permit), /먼저 확인/)
})
test('edit grants are record-specific and explicitly revocable', async () => {
  const repo = createRecordRepository(memoryStorage())
  const first = await repo.create(fixture(), PASSWORD); const second = await repo.create(fixture(), PASSWORD)
  const { permit } = await repo.unlock(first.id, PASSWORD)
  assert.throws(() => repo.update(second.id, second.data, permit), /먼저 확인/)
  repo.revoke(permit); assert.throws(() => repo.update(first.id, first.data, permit), /먼저 확인/)
})
test('a stale editor cannot overwrite an already updated record', async () => {
  const storage = memoryStorage(); const repo = createRecordRepository(storage); const other = createRecordRepository(storage)
  const record = await repo.create(fixture(), PASSWORD)
  const a = await repo.unlock(record.id, PASSWORD); const b = await other.unlock(record.id, PASSWORD)
  a.record.data.res[0] = '1'; repo.update(record.id, a.record.data, a.permit)
  assert.throws(() => other.update(record.id, b.record.data, b.permit), /다른 화면/)
  assert.equal(other.get(record.id).data.res[0], '1')
})
test('history sorts settlement dates; recent import selects save time and exact normal/raid type', async () => {
  const repo = createRecordRepository(memoryStorage())
  const newer = fixture(); newer.date = '2026-09-14'
  const older = fixture(); older.date = '2026-01-01'
  const a = await repo.create(newer, PASSWORD); const b = await repo.create(older, PASSWORD)
  await repo.create(fixture('normal/party'), PASSWORD); await repo.create(fixture('chaos/party'), PASSWORD)
  assert.equal(repo.latest('normal/raid').id, b.id)
  assert.ok(repo.list().findIndex(r => r.id === a.id) < repo.list().findIndex(r => r.id === b.id))
  const unlocked = await repo.unlock(a.id, PASSWORD); repo.update(a.id, a.data, unlocked.permit)
  assert.equal(repo.latest('normal/raid').id, a.id)
  assert.equal(createRecordRepository(memoryStorage()).latest('normal/raid'), null)
})
test('password hashing uses different salts; verification and minimum length work', async () => {
  const a = await protectPassword(PASSWORD); const b = await protectPassword(PASSWORD)
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.hash, b.hash)
  assert.equal(await verifyPassword(PASSWORD, a), true); assert.equal(await verifyPassword('incorrect', a), false)
  await assert.rejects(protectPassword('123'), /8~128/)
})
test('storage corruption, denial and quota errors preserve original data and report failure', async () => {
  const corrupt = memoryStorage([[RECORDS_KEY, 'not json']]); const repo = createRecordRepository(corrupt)
  assert.throws(() => repo.list(), /덮어쓰지/)
  await assert.rejects(repo.create(fixture(), PASSWORD), /덮어쓰지/)
  assert.equal(corrupt.getItem(RECORDS_KEY), 'not json')
  const full = createRecordRepository({ getItem: () => null, setItem: () => { throw new Error('quota') } })
  await assert.rejects(full.create(fixture(), PASSWORD), /저장 공간/)
  assert.throws(() => createRecordRepository(null).list(), /저장 공간/)
})
