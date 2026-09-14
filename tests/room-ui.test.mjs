import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import { ROOMS_KEY } from '../src/rooms/localRoomRepository.js'

test('UI: room create/share/read/admin edit, plus chaos party selector/filter and Korean inputs', async () => {
  const dom = new Window({ url: 'http://localhost:5173/#/rooms' })
  globalThis.window = dom; globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true })
  globalThis.HTMLElement = dom.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { act, createElement, StrictMode } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  let root
  const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(element => element.textContent.trim() === text)
  const label = text => document.querySelector(`[aria-label="${text}"]`)
  const click = async element => { assert.ok(element); await act(async () => element.click()) }
  const input = async (element, value) => {
    assert.ok(element)
    await act(async () => { const prototype = element.tagName === 'SELECT' ? dom.HTMLSelectElement.prototype : dom.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.Event('input', { bubbles: true })); element.dispatchEvent(new dom.Event('change', { bubbles: true })) })
  }
  const navigate = async path => act(async () => { dom.location.hash = path; dom.dispatchEvent(new dom.HashChangeEvent('hashchange')); await new Promise(resolve => setTimeout(resolve, 0)) })
  const wait = async predicate => { for (let index = 0; index < 120; index++) { if (predicate()) return; await act(async () => new Promise(resolve => setTimeout(resolve, 20))) } assert.ok(predicate()) }
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const mount = async () => { const node = document.createElement('div'); document.body.append(node); root = createRoot(node); await act(async () => root.render(createElement(StrictMode, null, createElement(App)))) }
    await mount()
    assert.match(document.body.textContent, /다른 PC·브라우저 공유는 Supabase 연결/)
    const createInputs = document.querySelectorAll('.room-form')[1].querySelectorAll('input')
    await input(createInputs[0], 'UI 공대방'); await input(createInputs[1], 'room-ui-password'); await input(createInputs[2], 'room-ui-password')
    await click(button('정산방 생성'))
    await wait(() => document.querySelector('.room-share-card strong'))
    const code = document.querySelector('.room-share-card strong').textContent
    assert.match(code, /^[A-Z0-9]{6}$/)
    assert.equal(document.querySelector('.room-share-link input').value, `http://localhost:5173/#/room/${code}`)
    await navigate(`/room/${code}/new/normal/party`)
    await input(document.querySelector('[placeholder="파티원 닉네임을 입력해주세요"]'), '세영')
    await click(button('+ 추가')); await click(button('+ 아이템 추가'))
    await input(document.querySelector('[placeholder="아이템 검색 또는 직접 입력"]'), '자쿰의 투구')
    await input(label('1트 아이템 1 판매금액'), '850000000')
    assert.match(label('1트 아이템 1 판매금액').closest('.money-field').textContent, /8억 5천/)
    await click(button('정산방에 저장'))
    await wait(() => document.querySelector('h1')?.textContent === '정산 기록 상세')
    const stored = JSON.parse(dom.localStorage.getItem(ROOMS_KEY)); const id = stored.settlements[0].settlementId
    assert.equal(stored.rooms[0].roomName, 'UI 공대방'); assert.equal(stored.settlements[0].roomId, stored.rooms[0].roomId)
    await act(async () => root.unmount()); document.body.innerHTML = ''; await mount()
    await wait(() => document.querySelector('h1')?.textContent === '정산 기록 상세')
    assert.ok(label('공대원 1 이름').disabled)
    await navigate(`/room/${code}/settlement/${id}/edit`)
    assert.equal(document.querySelector('h1').textContent, '관리자 확인이 필요합니다.')
    await click(button('관리자 비밀번호 확인')); await input(document.querySelector('input[type="password"]'), 'wrong-password'); await click(button('확인', document.querySelector('dialog')))
    await wait(() => document.querySelector('dialog .field-error'))
    assert.match(document.querySelector('dialog').textContent, /비밀번호가 일치하지 않습니다/)
    await input(document.querySelector('input[type="password"]'), 'room-ui-password'); await click(button('확인', document.querySelector('dialog')))
    await wait(() => button('수정 내용 저장'))
    await input(label('공대원 1 이름'), '수정 세영'); await click(button('수정 내용 저장'))
    await wait(() => document.querySelector('h1')?.textContent === '정산 기록 상세')
    assert.equal(JSON.parse(dom.localStorage.getItem(ROOMS_KEY)).settlements[0].revision, 2)
    await navigate('/chaos/party')
    assert.deepEqual([...label('등록할 소속 파티').options].map(option => option.textContent), ['1파티', '2파티', '3파티', '4파티', '5파티', '기타참여자'])
    for (const group of [1, 2, 3, 4, 5, 0]) {
      await input(document.querySelector('[placeholder="파티원 닉네임을 입력해주세요"]'), `소속${group}`)
      await input(label('등록할 소속 파티'), String(group)); await click(button('+ 추가'))
    }
    assert.equal(document.querySelectorAll('.roster-row').length, 6)
    const third = [...document.querySelectorAll('.party-filters button')].find(element => element.textContent.startsWith('3파티'))
    await click(third)
    assert.equal(document.querySelectorAll('.roster-row:not([hidden])').length, 1)
    assert.equal(document.querySelector('.roster-row:not([hidden]) input').value, '소속3')
    assert.equal(label('1트 소속3 사망 차감').disabled, false)
    const penalty = label('1트 소속3 사망 차감')
    assert.ok([...penalty.options].some(option => option.textContent === '☠ 50% 차감 (흰경)'))
    await input(penalty, 'white-exp')
    assert.equal(penalty.value, 'white-exp')
    assert.equal(label('2트 소속3 사망 차감').value, '0')
    await input(penalty, '50')
    assert.equal(penalty.selectedOptions[0].textContent, '☠ 50% 차감 (3페이즈 사망)')
    assert.equal(label('1트 소속0 사망 차감').disabled, true)
    assert.equal(document.querySelectorAll('.trial-workspace').length, 2)
  } finally {
    if (root) await act(async () => root.unmount())
    await server.close(); await dom.happyDOM.close()
    delete globalThis.window; delete globalThis.document; delete globalThis.navigator; delete globalThis.HTMLElement; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
