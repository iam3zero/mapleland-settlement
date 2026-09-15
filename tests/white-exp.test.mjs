import test from 'node:test'
import assert from 'node:assert/strict'
import { addMember, createSettlement, calculateSettlement, setParticipant } from '../src/settlement/model.js'
import { createRecordRepository } from '../src/settlement/records.js'

test('white-exp keeps existing 50% calculations in all modes and survives save/reload', async () => {
  for (const mode of ['normal/party', 'normal/raid', 'chaos/party']) {
    let data = createSettlement(mode)
    for (let i = 0; i < 6; i++) data = addMember(data, `공대원${i}`, `id${i}`, mode === 'chaos/party' && i > 2 ? 2 : 1)
    if (mode.endsWith('raid')) data.tries[0][0] = { ...data.tries[0][0], included: true, amount: '7000000' }
    else data.tries[0] = [{ id: 'item', name: '자쿰의 투구', amount: '7000000' }]
    const original = setParticipant(data, 0, 'id0', { penalty: 50 })
    const white = setParticipant(data, 0, 'id0', { penalty: 50, penaltyReason: 'white-exp' })
    assert.deepEqual(calculateSettlement(white), calculateSettlement(original))
    const values = new Map()
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
    const saved = await createRecordRepository(storage).create(white, 'test1234')
    const reloaded = createRecordRepository(storage).list().find(record => record.id === saved.id)
    assert.equal(reloaded.data.settings[0].participants.id0.penaltyReason, 'white-exp')
    assert.deepEqual(reloaded.data.settings[1], data.settings[1])
  }
})
