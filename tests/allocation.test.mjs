import test from 'node:test'
import assert from 'node:assert/strict'
import { addMember, allocateTrial, calculateSettlement, createSettlement, importRes, importRoster, removeMember, setManualRatio, setParticipant, trialSettings, validateForSave } from '../src/settlement/model.js'

function party(count = 6, mode = 'normal/party') {
  let data = createSettlement(mode)
  for (let i = 0; i < count; i++) data = addMember(data, `공대원${i + 1}`, `id-${i}`)
  return data
}
const points = result => result.rows.map(row => row.finalPoints)

test('six equal participants get exact equal money and displayed 100% total', () => {
  const result = allocateTrial(party().members, trialSettings(), 5700000000n)
  assert.deepEqual(points(result), [1667, 1667, 1667, 1667, 1666, 1666])
  assert.ok(result.rows.every(row => row.amount === 950000000n))
})
test('100% casualty gets zero; five healthy participants get 20% each', () => {
  const data = setParticipant(party(), 0, 'id-0', { penalty: 100 })
  const result = allocateTrial(data.members, data.settings[0], 6000000000n)
  assert.deepEqual(points(result), [0, 2000, 2000, 2000, 2000, 2000])
  assert.equal(result.rows[0].amount, 0n)
  assert.ok(result.rows.slice(1).every(row => row.amount === 1200000000n))
})
test('50% third-phase casualty keeps half; healthy members share the deducted amount', () => {
  const data = setParticipant(party(5), 0, 'id-0', { penalty: 50 })
  const result = allocateTrial(data.members, data.settings[0], 2500000000n)
  assert.deepEqual(points(result), [1000, 2250, 2250, 2250, 2250])
  assert.equal(result.rows[0].amount, 250000000n)
  assert.ok(result.rows.slice(1).every(row => row.amount === 562500000n))
})
test('mixed accidents redistribute only to healthy first-party members', () => {
  let data = party(4)
  data.members[3].party = 2
  data = setParticipant(setParticipant(data, 0, 'id-0', { penalty: 100 }), 0, 'id-1', { penalty: 50 })
  assert.deepEqual(points(allocateTrial(data.members, data.settings[0], 4000000n)), [0, 1250, 6250, 2500])
})
test('1st trial accident cannot affect the 2nd trial; individual totals sum both', () => {
  let data = party()
  data.tries = [[{ id: 'a', name: '아이템1', amount: '60000000' }], [{ id: 'b', name: '아이템2', amount: '60000000' }]]
  const before = calculateSettlement(data)
  data = setParticipant(data, 0, 'id-0', { penalty: 100 })
  const after = calculateSettlement(data)
  assert.deepEqual(after.trials[1], before.trials[1])
  assert.deepEqual(after.individuals[0].trials, [0n, 950000000n])
  assert.equal(after.individuals[1].total, 2090000000n)
})
test('manual 30% gives remaining five 14%; repeated edits replace the anchor', () => {
  let data = setManualRatio(party(), 0, 'id-0', '30')
  assert.deepEqual(points(calculateSettlement(data).trials[0]), [3000, 1400, 1400, 1400, 1400, 1400])
  data = setManualRatio(data, 0, 'id-0', '50')
  assert.deepEqual(points(calculateSettlement(data).trials[0]), [5000, 1000, 1000, 1000, 1000, 1000])
  data = setManualRatio(data, 0, 'id-1', '30')
  assert.deepEqual(points(calculateSettlement(data).trials[0]), [1400, 3000, 1400, 1400, 1400, 1400])
})
test('manual base precedes death penalties without allowing a dead member to receive money', () => {
  let data = setParticipant(setManualRatio(party(), 0, 'id-0', '30'), 0, 'id-0', { penalty: 50 })
  assert.deepEqual(points(calculateSettlement(data).trials[0]), [1500, 1700, 1700, 1700, 1700, 1700])
  data = setParticipant(data, 0, 'id-0', { penalty: 100 })
  assert.deepEqual(points(calculateSettlement(data).trials[0]), [0, 2000, 2000, 2000, 2000, 2000])
})
test('participation differs by trial; excluding or deleting a manual anchor clears its setting', () => {
  let data = setParticipant(setManualRatio(party(), 0, 'id-0', '30'), 0, 'id-0', { included: false })
  assert.equal(calculateSettlement(data).trials[0].count, 5)
  assert.equal(calculateSettlement(data).trials[1].count, 6)
  assert.equal(data.settings[0].manual, null)
  data = removeMember(data, 'id-0')
  assert.equal(data.members.length, 5)
  assert.equal(data.settings[0].participants['id-0'], undefined)
})
test('no healthy recipient blocks save instead of inventing a redistribution policy', () => {
  const data = setParticipant(setParticipant(party(2), 0, 'id-0', { penalty: 100 }), 0, 'id-1', { penalty: 50 })
  assert.equal(calculateSettlement(data).valid, false)
  assert.throws(() => validateForSave(data), /정상 1파티/)
})
test('single member, manual 0 and 100 percent, and invalid percent inputs', () => {
  assert.deepEqual(points(calculateSettlement(setManualRatio(party(1), 0, 'id-0', '30')).trials[0]), [10000])
  for (const value of ['-1', '101', 'NaN', '0.001', '']) assert.throws(() => setManualRatio(party(), 0, 'id-0', value))
})
test('raid subtracts each resurrection expense once from its own trial and keeps 5% fee', () => {
  const data = party(6, 'normal/raid')
  data.tries[0][0] = { ...data.tries[0][0], included: true, amount: '7000000' }
  data.tries[1][0] = { ...data.tries[1][0], included: true, amount: '14000000' }
  data.res = ['1000000', '2000000']
  const result = calculateSettlement(data)
  assert.equal(result.total.fee, 105000000n)
  assert.deepEqual(result.trials.map(trial => trial.final), [565000000n, 1130000000n])
  assert.equal(result.total.final, 1695000000n)
  assert.equal(result.individuals.reduce((sum, member) => sum + member.total, 0n) + result.remainder, result.total.final)
})
test('invalid dates, duplicate names and per-trial deficits prevent saving', () => {
  const data = party(6, 'normal/raid')
  data.res[0] = '1'; assert.throws(() => validateForSave(data), /리저 비용/)
  data.res[0] = ''; data.date = '2026-02-30'; assert.throws(() => validateForSave(data), /날짜/)
  data.date = '2026-09-14'; data.members[0].name = data.members[1].name; assert.throws(() => validateForSave(data), /이름/)
})
test('100% displayed ratios and monetary conservation across roster sizes and decimal ratios', () => {
  for (const count of [2, 3, 6, 7, 11, 30, 1000]) for (const percent of ['0', '16.67', '30.01', '100']) {
    const data = setParticipant(setManualRatio(party(count), 0, 'id-0', percent), 0, 'id-0', { penalty: 50 })
    const result = allocateTrial(data.members, data.settings[0], 99999999999995n)
    assert.equal(points(result).reduce((a, b) => a + b, 0), 10000)
    assert.equal(result.rows.reduce((sum, row) => sum + row.amount, 0n) + result.remainder, 99999999999995n)
  }
})
test('roster and resurrection imports are independent, editable copies with accidents reset', () => {
  const source = setParticipant(party(6, 'normal/raid'), 0, 'id-0', { penalty: 100 })
  source.res = ['1000000', '2000000']
  const current = party(2, 'normal/raid'); current.tries[0][0].amount = '7000000'; current.res = ['3', '4']
  const roster = importRoster(current, source)
  assert.deepEqual(roster.members.map(m => m.name), source.members.map(m => m.name))
  assert.deepEqual(roster.res, current.res); assert.deepEqual(roster.tries, current.tries)
  assert.deepEqual(roster.settings, [trialSettings(), trialSettings()])
  assert.notEqual(roster.members[0].id, source.members[0].id)
  const costs = importRes(current, source)
  assert.deepEqual(costs.res, source.res); assert.deepEqual(costs.members, current.members)
  costs.res[0] = '9'; assert.equal(source.res[0], '1000000')
  assert.throws(() => importRoster(current, party()), /동일한/)
})
