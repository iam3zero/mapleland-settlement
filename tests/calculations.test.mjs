import test from 'node:test'
import assert from 'node:assert/strict'
import { createRaid, distribute, formatMeso, parseAmount, saleAmounts, totalSales } from '../src/settlement/calculations.js'

const row = (amount, included = true) => ({ amount, included })

test('7,000,000 sale uses the current 5% fee, regardless of transaction type', () => {
  assert.deepEqual(saleAmounts('7000000'), { gross: 700000000n, fee: 35000000n, net: 665000000n })
})

test('60 million meso party sale distributes 9.5 million to each of six members', () => {
  const totals = totalSales([row('40000000'), row('20000000')])
  assert.equal(totals.fee, 300000000n)
  assert.equal(distribute(totals.net, 6).each, 950000000n)
  assert.equal(distribute(totals.net, 6).remainder, 0n)
})

test('two trials deduct resurrection costs exactly once before crew distribution', () => {
  const first = totalSales([row('7000000')])
  const second = totalSales([row('14000000')])
  const all = totalSales([row('7000000'), row('14000000')])
  assert.equal(first.net + second.net, all.net)
  assert.deepEqual(all, { gross: 2100000000n, fee: 105000000n, net: 1995000000n })
  const result = distribute(all.net, '6', 300000000n)
  assert.equal(result.final, 1695000000n)
  assert.equal(result.each, 282500000n)
})

test('excluded rows contribute neither revenue nor fee and can be included again', () => {
  const rows = [row('7000000'), row('13000000', false)]
  assert.deepEqual(totalSales(rows), saleAmounts('7000000'))
  assert.equal(rows[1].amount, '13000000')
  rows[1].included = true
  assert.equal(totalSales(rows).gross, 2000000000n)
  rows[0].included = false
  rows[1].included = false
  assert.deepEqual(totalSales(rows), { gross: 0n, fee: 0n, net: 0n })
})

test('fractional 5% fee is preserved; integer payouts retain a visible remainder', () => {
  assert.deepEqual(saleAmounts('1'), { gross: 100n, fee: 5n, net: 95n })
  const result = distribute(saleAmounts('101').net, '6')
  assert.equal(result.each, 1500n)
  assert.equal(result.remainder, 595n)
  assert.equal(formatMeso(result.remainder), '5.95')
  assert.equal(formatMeso(5n), '0.05')
})

test('zero, blank, negative, decimal and excessive crew sizes never divide', () => {
  for (const count of [0, '', -1, 1.5, 'abc', '1001', 'Infinity']) {
    const result = distribute(100000n, count)
    assert.equal(result.validCount, false)
    assert.equal(result.each, null)
    assert.equal(result.remainder, null)
  }
})

test('costs greater than income retain the deficit and suppress payout', () => {
  const result = distribute(9500n, 6, 10000n)
  assert.equal(result.final, -500n)
  assert.equal(result.each, null)
  assert.equal(formatMeso(result.final), '−5')
  assert.equal(distribute(0n, 6).each, 0n)
})

test('negative, decimal, exponent and unsafe inputs are rejected', () => {
  assert.equal(parseAmount(''), 0n)
  for (const value of ['-1', '1.5', '1e7', 'NaN', 'Infinity', '1000000000000']) {
    assert.throws(() => parseAmount(value))
  }
  assert.equal(saleAmounts('999999999999').fee, 4999999999995n)
})

test('initial raid has exactly two independent trials with nine explicitly opt-in rows', () => {
  const raid = createRaid()
  assert.deepEqual(raid.tries[0].map(r => r.name), ['1순', '2순', '3순', '투구올먹', '올먹', '트스', '어콤', '엔레', '어차'])
  assert.equal(raid.tries.length, 2)
  assert.equal(raid.tries.flat().every(r => !r.included && r.amount === ''), true)
  raid.tries[0][0].amount = '7000000'
  assert.equal(raid.tries[1][0].amount, '')
  assert.equal(createRaid().tries[0][0].amount, '')
})

test('every meso is accounted for over mixed amounts, fees, costs and crew sizes', () => {
  for (const amount of ['1', '19', '101', '7000001', '999999999999']) {
    const sale = saleAmounts(amount)
    assert.equal(sale.gross, sale.net + sale.fee)
    for (const count of [1, 3, 6, 30, 1000]) {
      const costs = sale.net > 100n ? 100n : 0n
      const result = distribute(sale.net, count, costs)
      assert.equal(result.each * BigInt(count) + result.remainder + costs + sale.fee, sale.gross)
      assert.ok(result.remainder >= 0n && result.remainder < BigInt(count) * 100n)
    }
  }
})
