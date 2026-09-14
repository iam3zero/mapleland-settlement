// All amounts are calculated in hundredths of a meso to preserve the exact 5% fee.
export const SALE_NAMES = ['1순', '2순', '3순', '투구올먹', '올먹', '트스', '어콤', '엔레', '어차']
export const MOCK_ITEMS = ['자쿰의 투구', '메이플 용사 20', '트리플 스로우 20', '어드밴스드 콤보 20', '엔젤레이 20', '어드밴스드 차지 10']
export const MAX_AMOUNT_DIGITS = 12

export function parseAmount(value) {
  const text = String(value).trim()
  if (text === '') return 0n
  if (!/^\d{1,12}$/.test(text)) throw new Error('판매금액은 12자리 이하의 0 이상 정수로 입력해주세요.')
  return BigInt(text)
}

export function saleAmounts(value) {
  const amount = parseAmount(value)
  return { gross: amount * 100n, fee: amount * 5n, net: amount * 95n }
}

export function totalSales(rows) {
  return rows.filter(row => row.included !== false).reduce((total, row) => {
    const sale = saleAmounts(row.amount)
    return { gross: total.gross + sale.gross, fee: total.fee + sale.fee, net: total.net + sale.net }
  }, { gross: 0n, fee: 0n, net: 0n })
}

export function distribute(net, count, expenses = 0n) {
  const final = net - expenses
  const validCount = /^\d{1,4}$/.test(String(count)) && Number(count) > 0 && Number(count) <= 1000
  const canDistribute = validCount && final >= 0n
  const each = canDistribute ? (final / (BigInt(count) * 100n)) * 100n : null
  const remainder = canDistribute ? final - each * BigInt(count) : null
  return { final, each, remainder, validCount, canDistribute }
}

export function formatMeso(cents) {
  if (cents === null || cents === undefined) return '—'
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const fraction = String(absolute % 100n).padStart(2, '0').replace(/0+$/, '')
  return `${negative ? '−' : ''}${(absolute / 100n).toLocaleString('ko-KR')}${fraction ? `.${fraction}` : ''}`
}

export function createParty() {
  return { members: [], items: [] }
}

export function createRaid() {
  return {
    tries: [1, 2].map(trial => SALE_NAMES.map((name, index) => ({ id: `${trial}-${index}`, name, amount: '', included: false }))),
    res: ['', ''],
    count: '6',
  }
}
