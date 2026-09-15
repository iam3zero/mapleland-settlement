import { ScrollTable } from './feedback'
import { koreanMeso } from './koreanMeso.js'
import { useId, useState } from 'react'
import { MOCK_ITEMS, formatMeso, saleAmounts } from './calculations.js'
import { addMember, calculateSettlement, participantState, partyId, partyLabel, partyOptions, removeMember, setManualRatio, setParticipant } from './model.js'
import { Money, MoneyInput, SectionTitle, TrialTable } from './shared.jsx'

function Roster({ data, onChange, readOnly, onImport }) {
  const [name, setName] = useState('')
  const [assignedParty, setAssignedParty] = useState(1)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [desiredCount, setDesiredCount] = useState('6')
  const [removeCount, setRemoveCount] = useState(0)
  const inputId = useId()
  const raid = data.mode.endsWith('raid')
  const changeCount = () => {
    try {
      if (!/^\d{1,4}$/.test(desiredCount) || Number(desiredCount) < 1 || Number(desiredCount) > 1000) throw new Error('공대원 수는 1~1,000명으로 입력해주세요.')
      const count = Number(desiredCount)
      if (count < data.members.length) { setRemoveCount(data.members.length - count); return }
      let next = data
      let serial = 1
      while (next.members.length < count) {
        while (next.members.some(member => member.name === `공대원${serial}`)) serial++
        next = addMember(next, `공대원${serial++}`)
      }
      onChange(next); setError('')
    } catch (reason) { setError(reason.message) }
  }
  const rename = (id, value) => {
    onChange({ ...data, members: data.members.map(member => member.id === id ? { ...member, name: value } : member) })
  }
  return <section className="editor-card">
    <SectionTitle step="01" title={raid ? '공대원 등록' : '파티원 등록'}><span className="count-badge">{data.members.length}명</span></SectionTitle>
    {!readOnly && <>
      <form className="member-form" onSubmit={event => { event.preventDefault(); try { onChange(addMember(data, name, crypto.randomUUID(), assignedParty)); setName(''); setError('') } catch (reason) { setError(reason.message) } }}>
        <label htmlFor={inputId} className="sr-only">파티원 이름</label><input id={inputId} className="text-input" placeholder="파티원 닉네임을 입력해주세요" value={name} maxLength={30} onChange={event => setName(event.target.value)} /><select className="text-input add-party" aria-label="등록할 소속 파티" value={assignedParty} onChange={event => setAssignedParty(Number(event.target.value))}>{partyOptions(data).map(party => <option key={party} value={party}>{partyLabel(party)}</option>)}</select><button className="button button-secondary">+ 추가</button>
      </form>
      {raid && <div className="bulk-crew"><label>공대원 수<input className="text-input" inputMode="numeric" value={desiredCount} onChange={event => { setDesiredCount(event.target.value); setRemoveCount(0) }} aria-label="일괄 등록 공대원 수" /></label><button className="button button-secondary" onClick={changeCount}>인원 적용</button></div>}
      {removeCount > 0 && <div className="inline-confirm" role="alert"><p>명단의 마지막 {removeCount}명과 해당 인원의 사고·비율 설정이 삭제됩니다.</p><button className="button button-secondary" onClick={() => { let next = data; data.members.slice(-removeCount).forEach(member => { next = removeMember(next, member.id) }); onChange(next); setRemoveCount(0) }}>삭제하고 적용</button><button className="text-button" onClick={() => setRemoveCount(0)}>취소</button></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>}
    <div className="party-filters" aria-label="공대원 파티 필터">{['all', ...partyOptions(data)].map(party => <button type="button" key={party} aria-pressed={filter === party} onClick={() => setFilter(party)}>{party === 'all' ? '전체' : partyLabel(party)} <small>{data.members.filter(member => party === 'all' || partyId(member, data) === party).length}명</small></button>)}</div><p className="allocation-help">{data.mode === 'chaos/party' ? '1~5파티는 공대원 분류입니다. 전체 공대가 함께 1트·2트를 진행하며, 파티당 6명을 권장하되 인원 제한은 없습니다.' : '파티별로 명단을 골라 볼 수 있습니다.'}</p><div className="roster-list">{data.members.map((member, index) => <div className="roster-row" key={member.id} hidden={filter !== 'all' && partyId(member, data) !== filter}>
      <span className="roster-index">{String(index + 1).padStart(2, '0')}</span>
      <input className="text-input" value={member.name} maxLength={30} disabled={readOnly} aria-label={`공대원 ${index + 1} 이름`} onChange={event => rename(member.id, event.target.value)} />
      <select className="text-input roster-party" value={partyId(member, data)} disabled={readOnly} aria-label={`${member.name || index + 1} 파티 구분`} onChange={event => {
        const party = Number(event.target.value)
        let next = { ...data, members: data.members.map(value => value.id === member.id ? { ...value, party } : value) }
        if (data.mode.endsWith('raid') && party !== 1) for (let trial = 0; trial < 2; trial++) next = setParticipant(next, trial, member.id, { penalty: 0 })
        onChange(next)
      }}>{partyOptions(data).map(party => <option key={party} value={party}>{partyLabel(party)}</option>)}</select>
      {!readOnly && <button className="text-button" aria-label={`${member.name} 파티원 삭제`} onClick={() => onChange(removeMember(data, member.id))}>삭제</button>}
    </div>)}</div>
    {!data.members.length && <p className="empty-hint">파티원을 등록한 뒤, 아래에서 트라이별 참여 여부를 선택해주세요.</p>}
    <p className="allocation-help">{!raid ? '사망 차감금은 같은 소속 파티의 정상 참여자에게만 재분배합니다. 기타참여자도 같은 규칙을 적용하며, 받을 사람이 없으면 차감금은 정산에서 제외합니다.' : '1파티만 사망 차감·재분배에 참여합니다. 기타 참여자는 기본/직접 조정 비율로 정산합니다.'}</p>
    {raid && !readOnly && <><button className="button button-secondary recent-button" onClick={() => onImport('roster')}>최근 기록 불러오기</button><p className="allocation-help">최근 노멀 외판공대 명단만 가져옵니다. 현재 명단을 교체하며 참여·비율·사고 설정은 초기화됩니다.</p></>}
  </section>
}

function PartyItems({ rows, trial, onChange, readOnly }) {
  const listId = useId()
  const update = (id, patch) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  return <section className="editor-card"><SectionTitle step={`0${trial + 1}`} title={`${trial}트 아이템 판매 내역`}><span className="count-badge">{rows.length}개</span></SectionTitle>
    <p className="editor-help">이름으로 검색하거나 직접 입력할 수 있어요. 검색 목록은 임시 데이터입니다.</p>
    <datalist id={listId}>{MOCK_ITEMS.map(item => <option key={item} value={item} />)}</datalist>
    <div className="party-items">{rows.map((item, index) => {
      const sale = saleAmounts(item.amount)
      return <article className="party-item" key={item.id}><div className="item-row-heading"><span>아이템 {index + 1}</span>{!readOnly && <button className="text-button" aria-label={`${trial}트 아이템 ${index + 1} 삭제`} onClick={() => onChange(rows.filter(row => row.id !== item.id))}>삭제</button>}</div>
        <div className="item-fields"><label>아이템명<input disabled={readOnly} className="text-input" list={listId} maxLength={80} value={item.name} placeholder="아이템 검색 또는 직접 입력" onChange={event => update(item.id, { name: event.target.value })} /></label><div><span className="input-label">판매금액</span><MoneyInput disabled={readOnly} label={`${trial}트 아이템 ${index + 1} 판매금액`} value={item.amount} onChange={amount => update(item.id, { amount })} /></div></div>
        {!item.name.trim() && <p className="field-error">아이템명을 입력해주세요.</p>}<div className="item-receipt"><span>수수료 5% <Money value={sale.fee} /></span><span>실제 받은 금액 <Money value={sale.net} /></span></div>
      </article>
    })}</div>
    {!rows.length && <p className="empty-hint item-empty">등록된 아이템이 없습니다.</p>}
    {!readOnly && <button className="button button-secondary add-item-button" onClick={() => onChange([...rows, { id: crypto.randomUUID(), name: '', amount: '' }])}>+ 아이템 추가</button>}
  </section>
}

function RatioInput({ member, trial, points, onApply, disabled }) {
  const [value, setValue] = useState((points / 100).toFixed(2))
  const [error, setError] = useState('')
  return <form className="ratio-input" onSubmit={event => { event.preventDefault(); try { onApply(value); setError('') } catch (reason) { setError(reason.message) } }}>
    <div><input disabled={disabled} aria-label={`${trial}트 ${member.name} 기본 비율`} inputMode="decimal" className="text-input" value={value} onChange={event => setValue(event.target.value)} /><span>%</span>{!disabled && <button className="text-button" type="submit">적용</button>}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>
}

function TrialAllocation({ data, onChange, index, result, readOnly }) {
  const setting = data.settings[index]
  const trial = index + 1
  return <section className="editor-card allocation-card"><SectionTitle step="☠" title={`${trial}트 개인별 정산`}><span className="count-badge">{result.count}명 참여</span></SectionTitle>
    <div className="trial-net"><span>{trial}트 최종 분배금</span><Money value={result.final} /></div>
    <p className="allocation-help">기본 비율을 먼저 조정한 뒤 사고 차감을 적용합니다. 한 명의 비율을 적용하면 나머지는 균등 재계산됩니다. {data.mode.endsWith('/party') ? '차감금은 같은 파티의 정상 참여자에게 균등 분배하며, 받을 사람이 없으면 정산에서 제외합니다. 이 경우 최종 비율 합계는 100%보다 작을 수 있습니다.' : '사망 차감금은 사고 없는 1파티 참여자에게만 균등 분배됩니다.'}</p>
    {!readOnly && <button className="text-button ratio-reset" onClick={() => onChange({ ...data, settings: data.settings.map((value, i) => i === index ? { ...value, manual: null } : value) })}>기본 비율 균등으로 되돌리기</button>}
    <ScrollTable tabIndex={0} role="region" aria-label={`${trial}트 개인별 정산표, 좌우 스크롤 가능`}><table className="allocation-table"><caption className="sr-only">{trial}트 이름, 기본 비율, 차감, 최종 비율, 최종 금액</caption><thead><tr><th>참여 · 이름</th><th>기본 비율</th><th>차감</th><th>최종 비율</th><th>최종 금액</th></tr></thead><tbody>{data.members.map(member => {
      const status = participantState(setting, member.id)
      const allocation = result.rows.find(row => row.id === member.id)
      const current = allocation?.basePoints ?? 0
      return <tr key={member.id} className={status.penalty && status.included ? 'accident-row' : ''}>
        <th scope="row"><label className="include-label"><input type="checkbox" disabled={readOnly} checked={status.included} aria-label={`${trial}트 ${member.name} 참여`} onChange={event => onChange(setParticipant(data, index, member.id, { included: event.target.checked }))} /><span>{member.name || '이름 미입력'}<small>{partyLabel(partyId(member, data))}</small></span></label></th>
        <td>{status.included ? <RatioInput key={`${member.id}-${current}-${setting.manual?.id}`} member={member} trial={trial} points={current} disabled={readOnly || result.count <= 1} onApply={percent => onChange(setManualRatio(data, index, member.id, percent))} /> : '—'}</td>
        <td><select className="text-input penalty-select" disabled={readOnly || !status.included || (data.mode.endsWith('raid') && member.party !== 1)} aria-label={`${trial}트 ${member.name} 사망 차감`} value={status.penalty === 50 && status.penaltyReason === 'white-exp' ? 'white-exp' : status.penalty} onChange={event => onChange(setParticipant(data, index, member.id, { penalty: event.target.value === 'white-exp' ? 50 : Number(event.target.value), penaltyReason: event.target.value === 'white-exp' ? 'white-exp' : null }))}><option value={0}>없음</option><option value={100}>☠ 100% 차감</option><option value={50}>☠ 50% 차감 (3페이즈 사망)</option><option value="white-exp">☠ 50% 차감 (흰경)</option></select></td>
        <td className="final-ratio">{allocation?.finalPoints != null ? `${(allocation.finalPoints / 100).toFixed(2)}%` : '—'}</td><td><Money value={allocation?.amount} /></td>
      </tr>
    })}</tbody><tfoot><tr><th colSpan={3}>최종 비율 합계</th><td>{result.valid && result.count ? `${(result.rows.reduce((sum, row) => sum + row.finalPoints, 0) / 100).toFixed(2)}%` : '—'}</td><td><Money value={result.valid ? result.final - result.remainder : null} /></td></tr></tfoot></table></ScrollTable>
    {result.error && <p className="result-warning" role="alert">{result.error}</p>}
    <p className="allocation-help">비율 표시는 소수 둘째 자리에서 합계 100%로 보정하며, 금액은 반올림 전 비율로 계산합니다. 1메소 미만은 잔여 메소로 남깁니다.</p>
    <div className="remainder-line"><span>{trial}트 분배 후 잔여 메소</span><Money value={result.remainder} /></div>
    {result.excluded > 0n && <div className="remainder-line"><span>재분배 대상 없음 · 정산 제외 차감금</span><Money value={result.excluded} /></div>}
  </section>
}

export function IndividualTotals({ result }) {
  return <section className="editor-card"><SectionTitle step="Σ" title="파티원별 정산 내역" />
    <p className="editor-help">1트 + 2트의 개인별 정산금을 합산합니다.</p>
    <ScrollTable tabIndex={0} role="region" aria-label="개인별 합산 정산표"><table className="individual-table"><thead><tr><th>이름</th><th>1트</th><th>2트</th><th>총 정산</th></tr></thead><tbody>{result.individuals.map(member => <tr key={member.id}><th scope="row">{member.name || '이름 미입력'}</th><td><Money value={member.trials[0]} /></td><td><Money value={member.trials[1]} /></td><td className="final-ratio"><Money value={member.total} /></td></tr>)}</tbody></table></ScrollTable>
    {!result.individuals.length && <p className="empty-hint">등록된 파티원이 없습니다.</p>}
  </section>
}

export function SettlementResult({ result, raid }) {
  const { total } = result
  const equal = result.individuals.length > 0 && result.valid && result.individuals.every(member => member.total === result.individuals[0].total)
  return <aside className="result-card" aria-label="정산 결과"><div className="result-heading"><span className="status-dot" /><h2>정산 결과</h2><span>수수료 5%</span></div><dl className="result-lines">
    {[['총 판매금액', total.gross], ['총 판매 수수료', total.fee], ['판매 후 실제 수익', total.net], ...(raid ? [['리저 비용', total.res]] : []), [raid ? '최종 공대 정산금' : '전체 정산금', total.final]].map(([label, value], index) => <div className={index === (raid ? 4 : 3) ? 'result-final' : ''} key={label}><dt>{label}</dt><dd><Money value={value} /></dd></div>)}
    <div><dt>{raid ? '공대원 수' : '참여 인원'}</dt><dd>{result.count}명</dd></div><div><dt>트라이별 참여</dt><dd>1트 {result.trials[0].count}명 · 2트 {result.trials[1].count}명</dd></div>
    </dl><div className="result-payout"><p>{equal ? '1인당 정산금' : '개인별 정산금 합계'}</p><strong>{formatMeso(result.valid && result.count ? equal ? result.individuals[0].total : total.final - result.remainder : null)}</strong><span>메소</span><small className="korean-money">{result.valid && result.count ? koreanMeso(equal ? result.individuals[0].total : total.final - result.remainder) : ''}</small></div>
    {!equal && result.count > 0 && <p className="allocation-help">개인별 금액은 아래 합산 정산표에서 확인해주세요.</p>}
    <div className="remainder-line"><span>분배 후 잔여 메소</span><Money value={result.remainder} /></div>
    {total.excluded > 0n && <div className="remainder-line"><span>정산 제외 차감금</span><Money value={total.excluded} /></div>}
    {result.trials.map((trial, index) => trial.error && <p className="result-warning" key={index}>{index + 1}트: {trial.error}</p>)}
    {!result.count && <p className="result-warning">파티원을 등록하면 1인당 정산금이 표시됩니다.</p>}
    <p className="calculation-note">수수료는 정확히 5%로 계산합니다.<br />사고 차감은 해당 트라이에만 적용합니다.<br />리저 비용은 해당 트라이 수익에서 차감합니다.</p>
  </aside>
}

export default function SettlementEditor({ data, onChange, readOnly = false, onImport, savedResult }) {
  const calculated = savedResult ?? calculateSettlement(data)
  const namesReady = data.tries.flat().every(item => item.name.trim())
  const result = namesReady ? calculated : { ...calculated, valid: false, remainder: null, individuals: calculated.individuals.map(member => ({ ...member, total: null })) }
  const raid = data.mode.endsWith('raid')
  const setRows = (index, rows) => onChange({ ...data, tries: data.tries.map((value, i) => i === index ? rows : value) })
  return <><div className="settlement-layout"><div className="editor-column">
    <Roster data={data} onChange={onChange} readOnly={readOnly} onImport={onImport} />
    {raid && <section className="editor-card"><SectionTitle step="02" title="리저 비용" /><p className="editor-help">1트·2트 리저 비용을 각 트라이의 실제 수익에서 한 번만 차감합니다.</p><div className="res-inputs">{data.res.map((value, index) => <div key={index}><span className="input-label">{index + 1}트 리저 비용</span><MoneyInput label={`${index + 1}트 리저 비용`} disabled={readOnly} value={value} onChange={amount => onChange({ ...data, res: data.res.map((cost, i) => i === index ? amount : cost) })} /></div>)}</div><div className="res-total"><span>리저 총 비용</span><Money value={result.total.res} /></div>{!readOnly && <button className="button button-secondary recent-button" onClick={() => onImport('res')}>최근 기록 불러오기</button>}</section>}
    {data.tries.map((rows, index) => <div className="trial-workspace" key={index}>
      <div className="trial-divider"><span>{index + 1}트</span><p>판매와 개인별 분배를 함께 확인하세요</p></div>
      {raid ? <><TrialTable rows={rows} trial={index + 1} onChange={next => setRows(index, next)} readOnly={readOnly} /><p className="allocation-help">리투(리트라이 투구)는 손님이 기존 투구를 버리고 다른 투구를 추가로 구매하는 판매입니다. 포함 체크 시 동일한 수수료 5%를 적용합니다.</p></> : <PartyItems rows={rows} trial={index + 1} onChange={next => setRows(index, next)} readOnly={readOnly} />}
      <TrialAllocation data={data} onChange={onChange} index={index} result={result.trials[index]} readOnly={readOnly} />
    </div>)}
  </div><SettlementResult result={result} raid={raid} /></div>
    {!namesReady && <p className="field-error">아이템명을 입력해야 정산을 저장할 수 있습니다.</p>}
    <div className="combined-results"><IndividualTotals result={result} /></div>
  </>
}

