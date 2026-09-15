import test from 'node:test'
import assert from 'node:assert/strict'
import { addMember, createSettlement, calculateSettlement, setParticipant, setManualRatio, validateForSave, restoreResult } from '../src/settlement/model.js'
import { createRecordRepository, RECORDS_KEY } from '../src/settlement/records.js'
import { createRoomHandler } from '../server/roomHandler.js'
import { createLocalRoomDatabase } from '../src/rooms/localRoomRepository.js'
import { createSupabaseRoomRepository } from '../src/rooms/repository.js'

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
function fixture(mode = 'normal/party', amount = '6000000') {
  let data = createSettlement(mode)
  for (const id of ['a', 'b', 'c']) data = addMember(data, id, id)
  data.tries = [1, 2].map(index => [{ id: String(index), name: '판매', amount: String(BigInt(amount) * BigInt(index)), included: true }])
  return data
}
const fund = (data, trial, id) => setParticipant(data, trial, id, { penalty: 50, penaltyReason: 'operating-fund' })
function conserved(result) {
  assert.equal(result.total.final, result.individuals.reduce((sum, member) => sum + member.total, 0n) + (result.total.operatingFund ?? 0n) + result.remainder)
  assert.equal(result.total.net - result.total.res, result.total.final + (result.total.excluded ?? 0n))
}

for (const mode of ['normal/party', 'chaos/party', 'normal/raid']) test(`${mode}: fund keeps half, redistributes nothing, preserves fee and whole amount`, () => {
  const data = fixture(mode)
  const original = calculateSettlement(data)
  const next = validateForSave(fund(data, 0, 'a'))
  assert.equal(next.individuals[0].trials[0], original.individuals[0].trials[0] / 2n)
  assert.equal(next.total.operatingFund, original.individuals[0].trials[0] / 2n)
  for (const i of [1, 2]) assert.equal(next.individuals[i].total, original.individuals[i].total)
  assert.equal(next.total.fee, original.total.fee)
  assert.equal(next.trials[1].operatingFund, 0n)
  assert.equal(next.trials[0].excluded ?? 0n, 0n)
  conserved(next)
})

test('old white-exp still redistributes; multiple fund members and manual proportions accumulate per trial', () => {
  let data = fixture()
  const white = calculateSettlement(setParticipant(data, 0, 'a', { penalty: 50, penaltyReason: 'white-exp' }))
  assert.equal(white.total.operatingFund ?? 0n, 0n)
  assert.equal(white.individuals[1].trials[0], 237500000n)
  data = setManualRatio(data, 0, 'a', '40')
  data = fund(fund(fund(data, 0, 'a'), 0, 'b'), 1, 'a')
  const result = validateForSave(data)
  assert.equal(result.trials[0].operatingFund, 199500000n)
  assert.equal(result.trials[1].operatingFund, 190000000n)
  assert.equal(result.total.operatingFund, 389500000n)
  conserved(result)
})

test('absent participant contributes nothing; singleton fund works; death and fund pools are separate', () => {
  let data = fixture('chaos/party')
  data.members[0].party = 5
  data = setParticipant(fund(fund(data, 0, 'a'), 1, 'a'), 1, 'a', { included: false })
  let result = validateForSave(data)
  assert.equal(result.trials[0].operatingFund, 95000000n)
  assert.equal(result.trials[1].operatingFund, 0n)
  assert.equal(result.individuals[0].trials[1], 0n)
  conserved(result)
  data = fund(setParticipant(fixture(), 0, 'b', { penalty: 100 }), 0, 'a')
  result = validateForSave(data)
  assert.equal(result.individuals[2].trials[0], 380000000n)
  assert.equal(result.total.operatingFund, 95000000n)
  conserved(result)
})

test('rounding, all-fund parties and unreallocated death deductions conserve money', () => {
  for (const amount of ['1', '101', '999999999999']) {
    let data = fixture('chaos/party', amount === '999999999999' ? '499999999999' : amount)
    for (const member of data.members) data = fund(data, 0, member.id)
    conserved(validateForSave(data))
    data = setParticipant(data, 0, 'b', { penalty: 100, penaltyReason: null })
    conserved(validateForSave(data))
  }
})

test('local save/reload/edit preserves fund reason and results; old snapshots stay intact', async () => {
  const storage = memory(); const repository = createRecordRepository(storage)
  const old = await repository.create(fixture(), 'test1234')
  const oldSnapshot = JSON.stringify(repository.get(old.id))
  const saved = await repository.create(fund(fixture(), 0, 'a'), 'test1234')
  const fresh = createRecordRepository(storage)
  const restored = fresh.get(saved.id)
  assert.equal(restored.data.settings[0].participants.a.penaltyReason, 'operating-fund')
  assert.equal(restoreResult(restored.result).total.operatingFund, 95000000n)
  assert.equal(restoreResult(restored.result).trials[0].rows[0].operatingFund, 95000000n)
  const { permit } = await fresh.unlock(saved.id, 'test1234')
  fresh.update(saved.id, fund(restored.data, 1, 'b'), permit)
  assert.equal(fresh.get(saved.id).result.total.operatingFund, '285000000')
  assert.equal(JSON.stringify(fresh.get(old.id)), oldSnapshot)
  assert.ok(storage.getItem(RECORDS_KEY))
})

test('Supabase HTTP adapter: server recalculates fund, separate visitor reads result, admin edits', async () => {
  const db = createLocalRoomDatabase(memory()); db.consumeLimit = async () => true
  const handler = createRoomHandler(db, { rateLimitSecret: 'test-only-secret-at-least-32-characters' })
  const fetcher = (url, options) => handler(new Request(url, options))
  const admin = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const visitor = createSupabaseRoomRepository({ url: 'https://example.supabase.co', fetcher })
  const created = await admin.createRoom({ roomName: '운영금 테스트', password: 'test1234' })
  const data = fund(fixture(), 0, 'a')
  const saved = await admin.saveSettlement(created.room.roomCode, created.token, data)
  assert.equal((await visitor.getRoom(created.room.roomCode)).settlements[0].result.total.operatingFund, '95000000')
  const response = await handler(new Request('https://example.supabase.co', { method: 'POST', body: JSON.stringify({ action: 'save', roomCode: created.room.roomCode, token: created.token, data: fund(data, 1, 'a'), settlementId: saved.settlementId, revision: saved.revision, result: { total: { operatingFund: '9999999' } } }) }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).result.total.operatingFund, '285000000')
  await assert.rejects(visitor.saveSettlement(created.room.roomCode, 'invalid', data), /관리자/)
})
