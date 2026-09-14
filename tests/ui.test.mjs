import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import { RECORDS_KEY, createRecordRepository } from '../src/settlement/records.js'
import { addMember, createSettlement } from '../src/settlement/model.js'

// DOM integration tests exercise the real React UI with browser-like localStorage.
// This does not replace a visual check in a real desktop/mobile browser.
test('UI: register, trial ratios/death, save, remount, view, password-gated edit and recent imports', async () => {
  const dom = new Window({ url: 'http://localhost:5173/#/normal/raid' })
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { value: dom.navigator, configurable: true })
  globalThis.HTMLElement = dom.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { act, createElement, StrictMode } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  let root
  const click = async element => { assert.ok(element, 'click target exists'); await act(async () => { element.click() }) }
  const button = (text, scope = document) => Array.from(scope.querySelectorAll('button')).find(element => element.textContent.trim() === text)
  const input = async (element, value) => {
    assert.ok(element, 'input target exists')
    await act(async () => {
      const prototype = element.tagName === 'SELECT' ? dom.HTMLSelectElement.prototype : dom.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
      element.dispatchEvent(new dom.Event('input', { bubbles: true }))
      element.dispatchEvent(new dom.Event('change', { bubbles: true }))
    })
  }
  const byLabel = label => document.querySelector(`[aria-label="${label}"]`)
  const navigate = async hash => { await act(async () => { dom.location.hash = hash; dom.dispatchEvent(new dom.HashChangeEvent('hashchange')); await new Promise(resolve => setTimeout(resolve, 0)) }) }
  const waitFor = async condition => {
    for (let i = 0; i < 100; i++) {
      if (condition()) return
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    }
    assert.ok(condition(), 'asynchronous UI completed')
  }
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const mount = async () => {
      const host = document.createElement('div'); document.body.append(host)
      root = createRoot(host)
      await act(async () => { root.render(createElement(StrictMode, null, createElement(App))) })
    }
    await mount()
    await input(document.querySelector('[placeholder="파티원 닉네임을 입력해주세요"]'), '공대장')
    await click(button('+ 추가'))
    await input(document.querySelector('[placeholder="파티원 닉네임을 입력해주세요"]'), '비숍')
    await click(button('+ 추가'))
    assert.equal(document.querySelectorAll('.roster-row').length, 2)
    await input(byLabel('1트 1순 판매금액'), '7000000')
    await click(byLabel('1트 1순 정산 포함'))
    await input(byLabel('2트 1순 판매금액'), '7000000')
    await click(byLabel('2트 1순 정산 포함'))
    await input(byLabel('1트 리저 비용'), '1000000')
    await input(byLabel('2트 리저 비용'), '2000000')
    await input(byLabel('1트 공대장 기본 비율'), '30')
    await click(button('적용', byLabel('1트 공대장 기본 비율').closest('form')))
    assert.match(document.querySelectorAll('.allocation-card')[0].textContent, /30.00%/)
    await input(byLabel('1트 공대장 사망 차감'), '100')
    const firstCard = document.querySelectorAll('.allocation-card')[0]
    assert.match(firstCard.textContent, /0.00%/)
    assert.match(document.querySelectorAll('.allocation-card')[1].textContent, /50.00%/)
    await click(button('정산 저장'))
    assert.ok(document.querySelector('dialog[open]'))
    const passwords = document.querySelectorAll('input[type="password"]')
    await input(passwords[0], 'integration-password')
    await input(passwords[1], 'integration-password')
    await click(button('저장', document.querySelector('dialog')))
    await waitFor(() => document.querySelector('h1')?.textContent === '정산 기록 상세')
    const saved = createRecordRepository(dom.localStorage).list()[0]
    assert.equal(saved.data.members.length, 2)
    assert.equal(saved.result.trials[0].rows[0].amount, '0')
    assert.equal(saved.result.trials[1].rows[0].amount, '232500000')
    assert.equal(saved.data.settings[0].manual.basisPoints, 3000)
    assert.ok(!dom.localStorage.getItem(RECORDS_KEY).includes('integration-password'))
    // Remount all React state, preserving the same origin's localStorage (reload behavior).
    await act(async () => root.unmount()); document.body.innerHTML = ''
    await mount()
    assert.equal(document.querySelector('h1').textContent, '정산 기록 상세')
    assert.ok(Array.from(document.querySelectorAll('.roster-row input')).every(element => element.disabled))
    await navigate('/history')
    assert.equal(document.querySelectorAll('.history-card').length, 1)
    await navigate(`/history/${saved.id}/edit`)
    assert.equal(document.querySelector('h1').textContent, '정산 기록 상세', 'direct edit URL does not bypass password')
    await click(button('수정하기'))
    await input(document.querySelector('input[type="password"]'), 'wrong-password')
    await click(button('확인', document.querySelector('dialog')))
    await waitFor(() => document.querySelector('dialog .field-error')?.textContent.includes('비밀번호가 일치하지 않습니다.'))
    assert.ok(byLabel('공대원 1 이름').disabled)
    await input(document.querySelector('input[type="password"]'), 'integration-password')
    await click(button('확인', document.querySelector('dialog')))
    await waitFor(() => button('수정 내용 저장'))
    assert.equal(byLabel('공대원 1 이름').disabled, false)
    await input(byLabel('공대원 1 이름'), '수정된 공대장')
    await click(button('수정 내용 저장'))
    await waitFor(() => document.querySelector('h1')?.textContent === '정산 기록 상세')
    assert.equal(createRecordRepository(dom.localStorage).get(saved.id).data.members[0].name, '수정된 공대장')
    assert.equal(createRecordRepository(dom.localStorage).get(saved.id).revision, 2)
    await navigate(`/history/${saved.id}/edit`)
    assert.equal(document.querySelector('h1').textContent, '정산 기록 상세', 'edit is locked again after save')
    // A newer party record must not be used by external-raid recent imports.
    let different = addMember(createSettlement('normal/party'), '다른 파티원')
    await createRecordRepository(dom.localStorage).create(different, 'another-password')
    await navigate('/normal/raid')
    const recentButtons = () => Array.from(document.querySelectorAll('button')).filter(element => element.textContent === '최근 기록 불러오기')
    await click(recentButtons()[0])
    assert.equal(byLabel('공대원 1 이름').value, '수정된 공대장')
    assert.equal(byLabel('1트 수정된 공대장 사망 차감').value, '0')
    await click(recentButtons()[1])
    assert.equal(byLabel('1트 리저 비용').value, '1,000,000')
    assert.equal(byLabel('2트 리저 비용').value, '2,000,000')
    await input(byLabel('1트 리저 비용'), '500000')
    assert.equal(createRecordRepository(dom.localStorage).get(saved.id).data.res[0], '1000000', 'import edits do not mutate stored history')
  } finally {
    if (root) await act(async () => root.unmount())
    await server.close(); await dom.happyDOM.close()
    delete globalThis.window; delete globalThis.document; delete globalThis.navigator; delete globalThis.HTMLElement; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})
