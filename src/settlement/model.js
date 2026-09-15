import { createParty, createRaid, parseAmount, saleAmounts, totalSales } from './calculations.js'

export const DRAFT_VERSION = 3
export const MODES = ['normal/party', 'chaos/party', 'normal/raid']
export const modeLabel = mode => `${mode.startsWith('chaos') ? '자쿰(카오스)' : '자쿰(노멀)'} / ${mode.endsWith('raid') ? '외판공대 정산' : '파티 보스정산'}`
export const localDate = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export const trialSettings = () => ({ participants: {}, manual: null })

export function createSettlement(mode) {
  if (!MODES.includes(mode)) throw new Error('지원하지 않는 정산 종류입니다.')
  const legacy = mode.endsWith('raid') ? createRaid() : createParty()
  return {
    version: DRAFT_VERSION, mode, date: localDate(), members: [],
    tries: mode.endsWith('raid') ? legacy.tries.map((rows, index) => [...rows, retrySale(index)]) : [legacy.items, []],
    res: mode.endsWith('raid') ? legacy.res : ['', ''],
    settings: [trialSettings(), trialSettings()],
  }
}

export function addMember(data, name, id = crypto.randomUUID(), party = 1) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('이름을 입력해주세요.')
  if (data.members.some(member => member.name === trimmed)) throw new Error('이미 등록된 이름입니다.')
  if (data.members.length >= 1000) throw new Error('최대 1,000명까지 등록할 수 있습니다.')
  return { ...data, members: [...data.members, { id, name: trimmed, party }] }
}

export function removeMember(data, id) {
  return {
    ...data, members: data.members.filter(member => member.id !== id),
    settings: data.settings.map(setting => ({
      ...setting,
      manual: setting.manual?.id === id ? null : setting.manual,
      participants: Object.fromEntries(Object.entries(setting.participants).filter(([key]) => key !== id)),
    })),
  }
}

export function participantState(setting, id) {
  return setting.participants[id] ?? { included: true, penalty: 0 }
}

export function setParticipant(data, trial, id, patch) {
  return {
    ...data,
    settings: data.settings.map((setting, index) => index === trial ? {
      ...setting,
      manual: patch.included === false && setting.manual?.id === id ? null : setting.manual,
      participants: { ...setting.participants, [id]: { ...participantState(setting, id), ...patch } },
    } : setting),
  }
}

export function setManualRatio(data, trial, id, percent) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(String(percent)) || Number(percent) > 100) throw new Error('비율은 0~100%, 소수 둘째 자리까지 입력해주세요.')
  const basisPoints = Math.round(Number(percent) * 100)
  return { ...data, settings: data.settings.map((setting, index) => index === trial ? { ...setting, manual: { id, basisPoints } } : setting) }
}

// Largest remainders affect percentage DISPLAY only. Exact integer weights calculate money.
export function displayPercentages(weights) {
  const sum = weights.reduce((total, weight) => total + weight, 0n)
  if (!sum) return weights.map(() => 0)
  const points = weights.map(weight => Number(weight * 10000n / sum))
  const fractions = weights.map((weight, index) => ({ index, rest: weight * 10000n % sum }))
    .sort((a, b) => a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1)
  const missing = 10000 - points.reduce((total, value) => total + value, 0)
  for (let index = 0; index < missing; index++) points[fractions[index].index]++
  return points
}

export function allocateTrial(members, setting, final, sameParty = false, allowUnpaid = false, fundEnabled = false) {
  const active = members.filter(member => participantState(setting, member.id).included)
  if (!active.length) return { valid: final === 0n, rows: [], count: 0, remainder: final === 0n ? 0n : null, error: final === 0n ? '' : '참여자를 한 명 이상 선택해주세요.' }
  const anchor = active.length > 1 && active.find(member => member.id === setting.manual?.id)
  const weights = active.map(member => anchor
    ? BigInt(member.id === anchor.id ? setting.manual.basisPoints * (active.length - 1) : 10000 - setting.manual.basisPoints)
    : 1n)
  const eligible = member => allowUnpaid || (sameParty ? member.party >= 1 && member.party <= 5 : member.party === 1)
  const penalties = active.map(member => eligible(member) ? participantState(setting, member.id).penalty : 0)
  const fundMembers = active.map((member, index) => fundEnabled && penalties[index] === 50 && participantState(setting, member.id).penaltyReason === 'operating-fund')
  const groups = [...new Set(active.filter(eligible).map(member => member.party))]
  const pools = new Map(groups.map(group => [group, weights.reduce((sum, weight, index) => sum + (active[index].party === group && !fundMembers[index] ? weight * BigInt(penalties[index]) : 0n), 0n)]))
  const healthyCounts = new Map(groups.map(group => [group, active.filter((member, index) => member.party === group && penalties[index] === 0).length]))
  const blocked = groups.find(group => pools.get(group) > 0n && healthyCounts.get(group) === 0)
  const error = final < 0n ? '리저 비용이 해당 트라이의 실제 수익보다 많습니다.'
    : !allowUnpaid && blocked ? '차감금을 받을 정상 ' + blocked + '파티 참여자가 없습니다. 사고·참여 설정을 확인해주세요.' : ''
  const basePoints = displayPercentages(weights)
  const scale = [...healthyCounts.values()].reduce((product, count) => product * BigInt(count || 1), 1n)
  const adjusted = weights.map((weight, index) => {
    const member = active[index]
    const share = eligible(member) && penalties[index] === 0 ? pools.get(member.party) * (scale / BigInt(healthyCounts.get(member.party) || 1)) : 0n
    return weight * BigInt(100 - penalties[index]) * scale + share
  })
  const denominator = weights.reduce((sum, weight) => sum + weight, 0n) * 100n * scale
  const fundWeights = weights.map((weight, index) => fundMembers[index] ? weight * 50n * scale : 0n)
  const fundWeight = fundWeights.reduce((sum, weight) => sum + weight, 0n)
  const excludedWeight = denominator - adjusted.reduce((sum, weight) => sum + weight, 0n) - fundWeight
  // Individual payments and fund contributions use whole meso; rounding stays in remainder.
  const fundAmounts = fundWeights.map(weight => error ? 0n : final * weight / (denominator * 100n) * 100n)
  const operatingFund = fundAmounts.reduce((sum, amount) => sum + amount, 0n)
  const excluded = allowUnpaid && !error ? final * excludedWeight / denominator : 0n
  const finalPoints = error ? [] : displayPercentages(excludedWeight + fundWeight > 0n ? [...adjusted, excludedWeight + fundWeight] : adjusted)
  const rows = active.map((member, index) => ({
    id: member.id, name: member.name, party: member.party,
    penalty: penalties[index], basePoints: basePoints[index], finalPoints: error ? null : finalPoints[index],
    amount: error ? null : final * adjusted[index] / (denominator * 100n) * 100n,
    ...(fundEnabled ? { operatingFund: fundAmounts[index] } : {}),
  }))
  const paid = rows.reduce((sum, row) => sum + (row.amount ?? 0n), 0n)
  return { valid: !error, error, rows, count: active.length, remainder: error ? null : final - paid - excluded - operatingFund, ...(allowUnpaid ? { excluded } : {}), ...(fundEnabled ? { operatingFund } : {}) }
}

export function calculateSettlement(data) {
  // Optional extension: old snapshots without this reason retain their exact result shape.
  const fundEnabled = data.version >= 3 && data.settings.some(setting => Object.values(setting.participants).some(status => status.penaltyReason === 'operating-fund'))
  const trials = data.tries.map((sales, index) => {
    const totals = totalSales(sales)
    const res = data.mode.endsWith('raid') ? parseAmount(data.res[index]) * 100n : 0n
    const final = totals.net - res
    const allocation = allocateTrial(data.members, data.settings[index], final, data.version >= 2 && data.mode === 'chaos/party', data.version >= 3 && data.mode.endsWith('/party'), fundEnabled)
    return { ...totals, res, final: final - (allocation.excluded ?? 0n), sales: sales.map(row => ({ ...row, ...saleAmounts(row.amount) })), ...allocation }
  })
  const total = trials.reduce((sum, trial) => ({
    gross: sum.gross + trial.gross, fee: sum.fee + trial.fee, net: sum.net + trial.net,
    res: sum.res + trial.res, final: sum.final + trial.final,
  }), { gross: 0n, fee: 0n, net: 0n, res: 0n, final: 0n })
  if (data.version >= 3) total.excluded = trials.reduce((sum, trial) => sum + (trial.excluded ?? 0n), 0n)
  if (fundEnabled) total.operatingFund = trials.reduce((sum, trial) => sum + (trial.operatingFund ?? 0n), 0n)
  const valid = trials.every(trial => trial.valid)
  const individuals = data.members.map(member => {
    const amounts = trials.map(trial => trial.valid ? trial.rows.find(row => row.id === member.id)?.amount ?? 0n : null)
    return { ...member, trials: amounts, total: valid ? amounts[0] + amounts[1] : null }
  })
  return { trials, total, individuals, valid, count: data.members.length, remainder: valid ? trials[0].remainder + trials[1].remainder : null }
}

export function validateDraft(data) {
  if (!data || ![1, 2, DRAFT_VERSION].includes(data.version) || !MODES.includes(data.mode)) throw new Error('지원하지 않는 정산 데이터입니다.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(`${data.date}T00:00:00Z`).toISOString().slice(0, 10) !== data.date) throw new Error('정산 날짜를 확인해주세요.')
  if (!Array.isArray(data.members) || data.members.length > 1000) throw new Error('공대원 목록을 확인해주세요.')
  const ids = new Set()
  const names = new Set()
  for (const member of data.members) {
    if (typeof member.id !== 'string' || !member.id || ids.has(member.id) || typeof member.name !== 'string' || !member.name.trim() || member.name.length > 30 || names.has(member.name.trim()) || !(data.version === 1 ? [1, 2] : data.mode === 'chaos/party' ? [0, 1, 2, 3, 4, 5] : [0, 1]).includes(member.party)) throw new Error('파티원 이름·중복·파티 구분을 확인해주세요.')
    ids.add(member.id); names.add(member.name.trim())
  }
  if (!Array.isArray(data.tries) || data.tries.length !== 2 || !Array.isArray(data.res) || data.res.length !== 2 || !Array.isArray(data.settings) || data.settings.length !== 2) throw new Error('트라이 데이터를 확인해주세요.')
  data.res.forEach(parseAmount)
  for (const rows of data.tries) {
    if (!Array.isArray(rows)) throw new Error('판매 내역을 확인해주세요.')
    const rowIds = new Set()
    for (const row of rows) {
      if (typeof row.id !== 'string' || rowIds.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80 || (row.included !== undefined && typeof row.included !== 'boolean')) throw new Error('아이템명을 입력하고 판매 내역을 확인해주세요.')
      rowIds.add(row.id); parseAmount(row.amount)
    }
  }
  for (const setting of data.settings) {
    if (!setting || !setting.participants || typeof setting.participants !== 'object' || Array.isArray(setting.participants)) throw new Error('참여 정보를 확인해주세요.')
    for (const [id, status] of Object.entries(setting.participants)) {
      if (!ids.has(id) || typeof status.included !== 'boolean' || ![0, 50, 100].includes(status.penalty)) throw new Error('사고 설정을 확인해주세요.')
      if (status.penaltyReason === 'operating-fund' && (data.version < 3 || status.penalty !== 50)) throw new Error('공대 운영금 차감은 50% 옵션으로 설정해주세요.')
    }
    if (setting.manual && (!ids.has(setting.manual.id) || !Number.isInteger(setting.manual.basisPoints) || setting.manual.basisPoints < 0 || setting.manual.basisPoints > 10000)) throw new Error('분배 비율을 확인해주세요.')
  }
  return data
}

export function validateForSave(data) {
  validateDraft(data)
  if (!data.members.length) throw new Error('파티원/공대원을 한 명 이상 등록해주세요.')
  const result = calculateSettlement(data)
  const invalid = result.trials.findIndex(trial => !trial.valid)
  if (invalid >= 0) throw new Error(`${invalid + 1}트: ${result.trials[invalid].error}`)
  return result
}

export const serializable = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item))

export function restoreResult(snapshot) {
  const money = value => value === null ? null : BigInt(value)
  const metrics = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, ['gross', 'fee', 'net', 'res', 'final', 'remainder', 'excluded', 'operatingFund'].includes(key) ? money(value) : value]))
  return {
    ...snapshot, total: metrics(snapshot.total), remainder: money(snapshot.remainder),
    trials: snapshot.trials.map(trial => ({ ...metrics(trial), rows: trial.rows.map(row => ({ ...row, amount: money(row.amount), ...(row.operatingFund !== undefined ? { operatingFund: money(row.operatingFund) } : {}) })) })),
    individuals: snapshot.individuals.map(member => ({ ...member, trials: member.trials.map(money), total: money(member.total) })),
  }
}

export function importRoster(data, source) {
  if (data.mode !== 'normal/raid' || source.mode !== data.mode) throw new Error('동일한 외판공대 기록만 불러올 수 있습니다.')
  return { ...data, members: migrateSettlement(source).members.map(member => ({ ...member, id: crypto.randomUUID() })), settings: [trialSettings(), trialSettings()] }
}

export function importRes(data, source) {
  if (data.mode !== 'normal/raid' || source.mode !== data.mode) throw new Error('동일한 외판공대 기록만 불러올 수 있습니다.')
  return { ...data, res: [...source.res] }
}

// Version 1 used party=2 for 'other'. Never rewrite old stored records on read.
export function migrateSettlement(data) {
  validateDraft(data)
  const next = structuredClone(data)
  if (next.version === 1) {
    next.members = next.members.map(member => ({ ...member, party: member.party === 2 ? 0 : member.party }))
  }
  next.version = DRAFT_VERSION
  if (next.mode === 'normal/raid') next.tries = next.tries.map((rows, index) => rows.some(row => row.name === '리투') ? rows : [...rows, retrySale(index)])
  return next
}
const retrySale = index => ({ id: `${index + 1}-retry-helmet`, name: '리투', amount: '', included: false })
export const partyId = (member, data) => data.version === 1 && member.party === 2 ? 0 : member.party
export const partyLabel = value => value === 0 ? '기타참여자' : value + '파티'
export const partyOptions = data => data.mode === 'chaos/party' ? [1, 2, 3, 4, 5, 0] : [1, 0]
