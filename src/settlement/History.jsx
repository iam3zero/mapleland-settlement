import { validateNewPassword } from './auth'
import { useEffect, useId, useRef, useState } from 'react'
import { modeLabel } from './model.js'
import { Money } from './shared.jsx'

export function PasswordDialog({ mode, title, description, submitLabel, children, onSubmit, onCancel, cloud = false }) {
  const ref = useRef(null)
  const id = useId()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const creating = mode === 'create'
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="notice-dialog password-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id={`${id}-title`}>{title ?? (creating ? '정산 기록 보호' : '정산 수정')}</h2>
    <p id={`${id}-description`}>{description ?? (creating ? '이 기록을 수정할 때 사용할 비밀번호를 설정해주세요.' : '이 기록을 수정하려면 비밀번호를 입력해주세요.')}</p>
    <form noValidate onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      if (creating) { try { validateNewPassword(password) } catch (reason) { setError(reason.message); return } }
      if (creating && password !== confirmation) { setError('비밀번호 확인이 일치하지 않습니다.'); return }
      setBusy(true); setError('')
      try { await onSubmit(password); setPassword(''); setConfirmation('') }
      catch (reason) { setError(reason.message); setBusy(false) }
    }}>
      {children && <fieldset className="room-editor-fieldset" disabled={busy}>{children}</fieldset>}
      <label>비밀번호<input className="text-input" type="password" value={password} minLength={creating ? 4 : undefined} maxLength={creating ? 8 : 128} autoComplete={creating ? 'new-password' : 'current-password'} autoFocus required disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      {creating && <label>비밀번호 확인<input className="text-input" type="password" value={confirmation} minLength={4} maxLength={8} autoComplete="new-password" required disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>}
      {creating && <p className="allocation-help">4~8자 · 비밀번호를 잊으면 이 기록을 수정할 수 없습니다.</p>}
      {!creating && <p className="allocation-help">기존의 긴 비밀번호도 그대로 입력할 수 있습니다.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={onCancel}>취소</button><button className="button button-primary" disabled={busy} type="submit">{busy ? '확인 중…' : submitLabel ?? (creating ? '저장' : '확인')}</button></div>
      <p className="local-protection-note">{cloud ? '정산방 서버에서 비밀번호를 확인합니다. 수정 권한은 이 정산방에 한해 15분 동안 유효합니다.' : '이 브라우저에 저장되는 로컬 수정 보호입니다. 다른 기기와 공유되지 않으며, 브라우저 데이터에 직접 접근하는 사용자를 막는 서버 인증은 아닙니다.'}</p>
    </form>
  </dialog>
}

export function HistoryList({ records, error }) {
  return <main id="main" className="page-container service-page"><a className="back-link" href="#/">← 홈으로</a><div className="service-title"><p className="section-kicker">SETTLEMENT HISTORY</p><h1 tabIndex={-1}>지난 정산 내역</h1><p>함께한 모험과 정산을 다시 확인하세요.</p></div>
    <div className="history-toolbar"><span>저장된 정산 <strong>{records.length}개</strong></span><a className="button button-secondary" href="#/bosses">새 정산 시작 →</a></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="history-list">{records.map(record => <a className="history-card" key={record.id} href={`#/history/${record.id}`}><div><time dateTime={record.data.date}>{record.data.date.replaceAll('-', '.')}</time><h2>{modeLabel(record.data.mode)}</h2><p>공대원 {record.data.members.length}명 · 1트 / 2트</p></div><div className="history-amount"><span>최종 정산금</span><strong><Money value={BigInt(record.result.total.final)} /></strong><span className="history-arrow" aria-hidden="true">→</span></div></a>)}</div>
    {!records.length && !error && <div className="history-empty"><h2>아직 저장된 정산이 없어요.</h2><p>정산 화면에서 ‘정산 저장’을 누르면 여기에 기록됩니다.</p><a className="button button-primary" href="#/bosses">첫 정산 시작하기 →</a></div>}
    <p className="draft-note">정산 날짜가 최신인 순서입니다. 저장 기록은 이 브라우저에 보관되며, 브라우저 데이터를 삭제하면 함께 삭제됩니다.</p>
  </main>
}
