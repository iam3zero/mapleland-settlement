import { ScrollTable } from './feedback'
import { koreanMeso } from './koreanMeso.js'
import { useId, useRef, useState } from 'react'
import { formatMeso, MAX_AMOUNT_DIGITS, saleAmounts, totalSales } from './calculations.js'

export function Money({ value }) {
  return <span className="money-display"><span className="meso-value">{formatMeso(value)} <small>메소</small></span>{koreanMeso(value) && <small className="korean-money">{koreanMeso(value)}</small>}</span>
}

export function MoneyInput({ value, onChange, label, disabled = false }) {
  const [error, setError] = useState('')
  const id = useId()
  return <div className="money-field"><div className="money-input"><input id={id} type="text" inputMode="numeric" autoComplete="off" aria-label={label} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={Boolean(error)} disabled={disabled} placeholder="0" value={value === '' ? '' : BigInt(value).toLocaleString('ko-KR')} onChange={(event) => {
    const next = event.target.value.replaceAll(',', '').trim()
    if (!new RegExp(`^\\d{0,${MAX_AMOUNT_DIGITS}}$`).test(next)) {
      setError('0 이상 정수를 12자리 이하로 입력해주세요. 기존 금액이 유지됩니다.')
      return
    }
    setError('')
    onChange(next.replace(/^0+(?=\d)/, ''))
  }} /><span>메소</span></div>{value && BigInt(value) > 0n && <small className="korean-money">{koreanMeso(BigInt(value) * 100n)}</small>}{error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}</div>
}

export function SectionTitle({ step, title, children }) {
  return <div className="editor-section-heading"><div><span className="step-label">{step}</span><h2>{title}</h2></div>{children}</div>
}

export function BossMenus() {
  const dialog = useRef(null)
  return <main id="main" className="page-container service-page"><a href="#/" className="back-link">← 홈으로</a><div className="service-title"><p className="section-kicker">BOSS SETTLEMENT</p><h1 tabIndex={-1}>어떤 보스를 정산할까요?</h1><p>보스와 운영 방식에 맞는 정산을 선택해주세요.</p></div><div className="boss-menu-grid">{[{ key: 'normal', name: '자쿰(노멀)', label: 'NORMAL' }, { key: 'chaos', name: '자쿰(카오스)', label: 'CHAOS' }].map(boss => <section className="boss-menu-card" key={boss.key}><div className="boss-menu-top"><span className="boss-monogram" aria-hidden="true">Z</span><span className="sample-badge">{boss.label}</span></div><h2>{boss.name}</h2><p>함께한 공략을 깔끔하게 마무리하세요.</p><a className="mode-link" href={`#/${boss.key}/party`}><span><strong>파티 보스정산</strong><small>아이템 판매 수익을 파티원과 균등 분배</small></span><span className="mode-status">운영 중 →</span></a>{boss.key === 'normal' ? <a className="mode-link" href="#/normal/raid"><span><strong>외판공대 정산</strong><small>1트·2트 판매와 리저 비용을 한 번에</small></span><span className="mode-status">운영 중 →</span></a> : <button className="mode-link" onClick={() => dialog.current.showModal()}><span><strong>외판공대 정산</strong><small>외부 손님 판매 수익을 공대원에게 정산</small></span><span className="mode-status pending">준비 중</span></button>}</section>)}</div><div className="future-bosses"><span>다음 모험도 준비하고 있어요</span><div><span>크림슨우드 <small>파티 보스정산 · 예정</small></span><span>혼테일 <small>파티 보스정산 · 예정</small></span></div></div><dialog className="notice-dialog" ref={dialog} aria-labelledby="chaos-title" aria-describedby="chaos-description"><h2 id="chaos-title">자쿰(카오스) 외판공대 정산</h2><p id="chaos-description">현재 준비 중인 기능입니다.<br />파티 보스정산은 이용할 수 있습니다.</p><p className="dialog-caption">외판공대 정산은 준비 중입니다.</p><form method="dialog"><button className="button button-primary">확인</button></form></dialog></main>
}

export function TrialTable({ rows, trial, onChange, readOnly = false }) {
  const totals = totalSales(rows)
  const update = (id, patch) => onChange(rows.map(row => row.id === id ? { ...row, ...patch } : row))
  return <section className="editor-card trial-card"><SectionTitle step={`0${trial}`} title={`${trial}트 판매 내역`}><span className="count-badge">{rows.filter(row => row.included).length}개 포함</span></SectionTitle><p className="editor-help">정산에 포함할 항목을 체크해주세요. 제외해도 입력한 금액은 유지됩니다.</p><ScrollTable tabIndex={0} role="region" aria-label={`${trial}트 판매표. 작은 화면에서는 좌우로 스크롤할 수 있습니다.`}><table className="sales-table"><caption className="sr-only">{trial}트 항목별 판매금액과 수수료, 실제 받은 금액. 단위 메소.</caption><thead><tr><th scope="col">포함 · 항목</th><th scope="col">판매금액</th><th scope="col">수수료 5%</th><th scope="col">실제 받은 금액</th></tr></thead><tbody>{rows.map(row => {
    const sale = saleAmounts(row.amount)
    return <tr key={row.id} className={row.included ? '' : 'excluded-row'}><th scope="row"><label className="include-label"><input type="checkbox" disabled={readOnly} checked={row.included} onChange={event => update(row.id, { included: event.target.checked })} aria-label={`${trial}트 ${row.name} 정산 포함`} /><span>{row.name}</span></label></th><td><MoneyInput disabled={readOnly} label={`${trial}트 ${row.name} 판매금액`} value={row.amount} onChange={amount => update(row.id, { amount })} /></td><td><Money value={sale.fee} /></td><td><Money value={sale.net} />{!row.included && <small className="excluded-tag">합계 제외</small>}</td></tr>
  })}</tbody><tfoot><tr><th scope="row">포함 항목 합계</th><td><Money value={totals.gross} /></td><td><Money value={totals.fee} /></td><td><Money value={totals.net} /></td></tr></tfoot></table></ScrollTable></section>
}
