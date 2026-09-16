import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'

test('cloud directory UI loads independently, refreshes on focus/rename, paginates and links by code', async () => {
  const dom = new Window({ url: 'http://localhost:5173/#/rooms' })
  globalThis.window = dom; globalThis.document = dom.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true })
  const { act, createElement } = await import('react'); const { createRoot } = await import('react-dom/client')
  const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  let rooms = [{ roomId: 'id', roomCode: '18PMMM', roomName: '공개 공대', createdAt: '2026-09-16T00:00:00Z', latestSettlementDate: '2026-09-16' }]
  const calls = []
  const service = { listAllRooms: async offset => { calls.push(offset); return { rooms: offset === 0 ? rooms : [], hasMore: offset === 0 } } }
  try {
    const { default: AllRooms } = await server.ssrLoadModule('/src/rooms/AllRooms.jsx')
    const render = async revision => act(async () => root.render(createElement(AllRooms, { service, mode: 'supabase', revision })))
    await render(0)
    assert.equal(dom.localStorage.length, 0)
    assert.equal(document.querySelector('article a').getAttribute('href'), '#/room/18PMMM')
    assert.match(document.querySelector('article').textContent, /🍁.*공개 공대.*최근 정산.*2026.09.16/s)
    rooms = [{ ...rooms[0], roomName: '변경 공대', icon: '🍀' }]
    await render(1)
    assert.match(document.querySelector('article').textContent, /🍀.*변경 공대/s)
    await act(async () => document.querySelector('.all-rooms-pagination button').click())
    assert.equal(calls.at(-1), 30); assert.match(document.body.textContent, /표시할 정산방이 없습니다/)
    await act(async () => document.querySelector('.all-rooms-pagination button').click())
    assert.equal(document.querySelectorAll('article').length, 1)
    rooms = []
    await act(async () => dom.dispatchEvent(new dom.Event('focus')))
    assert.equal(document.querySelectorAll('article').length, 0)
    assert.equal(dom.localStorage.length, 0)
  } finally {
    await act(async () => root.unmount()); await server.close(); await dom.happyDOM.close()
    delete globalThis.window; delete globalThis.document; delete globalThis.navigator; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
