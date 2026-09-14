import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('home and all available settlement routes render with correct menu structure', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.jsx')
    const render = route => {
      globalThis.window = { location: { hash: `#${route}` } }
      return renderToStaticMarkup(createElement(App))
    }
    const home = render('/')
    assert.match(home, /보스 정산을/)
    assert.match(home, /href="#\/bosses"/)
    const menus = render('/bosses')
    for (const path of ['/normal/party', '/normal/raid', '/chaos/party']) assert.ok(menus.includes(`href="#${path}"`))
    assert.match(menus, /자쿰\(카오스\) 외판공대 정산/)
    assert.match(menus, /현재 준비 중인 기능입니다./)
    assert.match(menus, /파티 보스정산은 이용할 수 있습니다./)
    for (const path of ['/normal/party', '/chaos/party']) {
      const html = render(path)
      assert.match(html, /파티원 등록/)
      assert.match(html, /아이템 추가/)
      assert.match(html, /파티원별 정산 내역/)
      assert.doesNotMatch(html, /1트 판매 내역/)
    }
    const raid = render('/normal/raid')
    assert.equal((raid.match(/type="checkbox"/g) || []).length, 18)
    for (const label of ['1트 판매 내역', '2트 판매 내역', '1트 리저 비용', '2트 리저 비용', '최종 공대 정산금', '1인당 정산금']) assert.ok(raid.includes(label))
    for (const obsolete of ['1.8%', '수작여부', '공대 운영금', '확성기', '1인당 아이템 분배금']) assert.ok(!raid.includes(obsolete))
    assert.match(render('/unknown'), /이 주소에 해당하는 정산 화면이 없습니다./)
  } finally {
    delete globalThis.window
    await server.close()
  }
})
