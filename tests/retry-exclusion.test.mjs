import test from 'node:test'
import assert from 'node:assert/strict'
import { addMember, createSettlement, calculateSettlement, setParticipant, validateForSave, migrateSettlement, serializable } from '../src/settlement/model.js'

test('raid retry helmet sales use each trial and the existing 5% fee', () => {
  const data = addMember(createSettlement('normal/raid'), '공대장', 'a')
  for (let index = 0; index < 2; index++) Object.assign(data.tries[index].find(row => row.name === '리투'), { included: true, amount: String((index + 1) * 1000000) })
  const result = validateForSave(data)
  assert.equal(result.trials[0].gross, 100000000n)
  assert.equal(result.trials[1].fee, 10000000n)
  assert.equal(result.total.final, 285000000n)
  assert.ok(createSettlement('normal/party').tries.every(rows => !rows.some(row => row.name === '리투')))
  const old = structuredClone(data); old.version = 2; old.tries.forEach(rows => rows.pop())
  const before = serializable(calculateSettlement(old))
  assert.equal(migrateSettlement(old).tries[0].at(-1).name, '리투')
  assert.deepEqual(serializable(calculateSettlement(old)), before)
})

for (const party of [0, 1, 2, 3, 4, 5]) for (const penalty of [50, 100]) {
  test(`single member party ${party}, penalty ${penalty}: excluded without transferring to another party or trial`, () => {
    let data = addMember(addMember(createSettlement('chaos/party'), 'A', 'a', party), 'B', 'b', party === 1 ? 2 : 1)
    data.tries = [1, 2].map(i => [{ id: String(i), name: '아이템', amount: '2000000' }])
    data = setParticipant(data, 0, 'a', { penalty, penaltyReason: penalty === 50 ? 'white-exp' : null })
    const result = validateForSave(data)
    assert.equal(result.individuals[0].trials[0], 95000000n * BigInt(100 - penalty) / 100n)
    assert.equal(result.individuals[1].trials[0], 95000000n)
    assert.equal(result.individuals[0].trials[1], 95000000n)
    assert.equal(result.total.excluded, 95000000n * BigInt(penalty) / 100n)
    assert.equal(result.total.final + result.total.excluded, result.total.net)
    assert.equal(result.individuals.reduce((s, m) => s + m.total, 0n) + result.remainder, result.total.final)
  })
}

test('normal single participant can save a fully deducted zero payout', () => {
  let data = addMember(createSettlement('normal/party'), 'A', 'a')
  data.tries[0] = [{ id: 'sale', name: '아이템', amount: '1000000' }]
  data = setParticipant(data, 0, 'a', { penalty: 100 })
  const result = validateForSave(data)
  assert.equal(result.total.final, 0n)
  assert.equal(result.individuals[0].total, 0n)
  assert.equal(result.trials[0].rows[0].finalPoints, 0)
})
