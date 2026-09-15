import test from 'node:test'
import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import { protectPassword, verifyPassword } from '../src/settlement/auth.js'
import { createRoomHandler } from '../server/roomHandler.js'
import { createLocalRoomDatabase } from '../src/rooms/localRoomRepository.js'

test('new passwords accept 4–8 characters and reject other lengths; legacy long hash still authenticates', async () => {
  for (const password of ['a한!4', '12345678']) assert.equal(await verifyPassword(password, await protectPassword(password)), true)
  for (const password of ['', '123', '123456789']) await assert.rejects(protectPassword(password), /비밀번호는 4~8자리로 입력해주세요/)
  const password = 'previous-long-password-123'
  const salt = Buffer.alloc(16, 17)
  const protection = { algorithm: 'PBKDF2-SHA256', iterations: 600000, salt: salt.toString('hex'), hash: pbkdf2Sync(password, salt, 600000, 32, 'sha256').toString('hex') }
  assert.equal(await verifyPassword(password, protection), true)
  assert.equal(await verifyPassword('wrong', protection), false)
})

test('Edge handler enforces new password policy before creating a room', async () => {
  const values = new Map()
  const db = createLocalRoomDatabase({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
  db.consumeLimit = async () => true
  const handler = createRoomHandler(db, { rateLimitSecret: 'test-secret-at-least-32-characters-long' })
  const create = password => handler(new Request('https://example.com', { method: 'POST', body: JSON.stringify({ action: 'create', roomName: '정책 테스트', password }) }))
  for (const password of ['123', '123456789']) { const response = await create(password); assert.equal(response.status, 400); assert.match((await response.json()).error, /4~8자리/) }
  assert.equal((await create('abcd')).status, 201)
})
