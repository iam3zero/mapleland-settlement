// Input is hundredths of a meso, as in the existing exact BigInt calculation layer.
export function koreanMeso(cents) {
  if (cents == null || cents === 0n) return ''
  const negative = cents < 0n
  const value = negative ? -cents : cents
  const whole = value / 100n
  if (whole === 0n) return (negative ? '−' : '') + '1메소 미만'
  const coefficient = amount => amount >= 1000n && amount % 1000n === 0n ? `${amount / 1000n}천` : amount.toLocaleString('ko-KR')
  const parts = []
  let remaining = whole
  for (const [unit, label] of [[1000000000000n, '조'], [100000000n, '억'], [10000n, '만']]) {
    const amount = remaining / unit
    remaining %= unit
    if (!amount) continue
    const shorthand = label === '만' && parts.some(part => part.endsWith('억')) && amount % 1000n === 0n
    parts.push(coefficient(amount) + (shorthand ? '' : label))
  }
  if (!parts.length) parts.push(whole.toLocaleString('ko-KR'))
  const approximate = value % 100n !== 0n || (whole >= 10000n && remaining !== 0n)
  return `${approximate ? '약 ' : ''}${negative ? '−' : ''}${parts.join(' ')}`
}
