import { SaveError } from './feedback'
import { notifySaved } from './notifications'
import { useEffect, useState } from 'react'
import { useCallback } from 'react'
import Rooms from '../rooms/Rooms.jsx'
import { createRecordRepository, RECORDS_KEY } from './records.js'
import { createSettlement, importRes, importRoster, modeLabel, migrateSettlement, MODES, restoreResult, validateForSave } from './model.js'
import { BossMenus } from './shared.jsx'
import SettlementEditor from './SettlementEditor.jsx'
import { HistoryList, PasswordDialog } from './History.jsx'
import './settlement.css'
import './extensions.css'

function useRecords() {
  const [repository] = useState(() => {
    let storage
    try { storage = globalThis.window?.localStorage } catch { /* Access failure is reported by the repository. */ }
    return createRecordRepository(storage)
  })
  const load = useCallback(() => { try { return { records: repository.list(), error: '' } } catch (reason) { return { records: [], error: reason.message } } }, [repository])
  const [state, setState] = useState(load)
  const refresh = () => setState(load())
  useEffect(() => {
    const update = event => { if (event.key === RECORDS_KEY || event.key === null) setState(load()) }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [load])
  return { repository, ...state, refresh }
}

function EditorPage({ data, onChange, recordsStore, onSaved, editing = false, onCancel, onImport }) {
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const raid = data.mode.endsWith('raid')
  const prepareSave = () => {
    if (saving) return
    setAttempt(value => value + 1)
    try {
      validateForSave(data)
      setError('')
      if (editing) { setSaving(true); onSaved(); notifySaved(); setNotice('변경 내용을 저장했습니다.') }
      else setSaving(true)
    } catch (reason) { setError(reason.message); setSaving(false) }
  }
  const loadRecent = kind => {
    try {
      const recent = recordsStore.repository.latest('normal/raid')
      if (!recent) { setNotice('저장된 자쿰(노멀) 외판공대 정산 기록이 없습니다.'); return }
      onImport(kind, recent.data)
      setNotice(`${recent.data.date} 정산의 ${kind === 'roster' ? '공대원 명단' : '리저 비용'}을 불러왔습니다.`)
      setError('')
    } catch (reason) { setError(reason.message) }
  }
  return <main id="main" className="page-container service-page">
    <a className="back-link" href={editing ? '#/history' : '#/bosses'}>← {editing ? '지난 정산 내역' : '보스 선택'}</a>
    <div className="service-title"><p className="section-kicker">{data.mode.startsWith('chaos') ? '자쿰(카오스)' : '자쿰(노멀)'} <span className="mode-status">{editing ? '기록 수정 중' : '운영 중'}</span></p><h1 tabIndex={-1}>{raid ? '외판공대 정산' : '파티 보스정산'}</h1><p>{raid ? '두 번의 공략, 판매부터 개인별 분배까지 깔끔하게.' : '함께 얻은 아이템의 수익을 트라이별로 나눠요.'}</p></div>
    {!editing && <nav className="settlement-tabs" aria-label="정산 방식"><a aria-current={!raid ? 'page' : undefined} href={`#/${data.mode.startsWith('chaos') ? 'chaos' : 'normal'}/party`}>파티 보스정산</a>{!data.mode.startsWith('chaos') && <a aria-current={raid ? 'page' : undefined} href="#/normal/raid">외판공대 정산</a>}</nav>}
    <div className="editor-toolbar"><label>정산 날짜<input className="text-input" type="date" value={data.date} onChange={event => onChange({ ...data, date: event.target.value })} /></label><div>{editing && <button className="button button-secondary" onClick={onCancel}>수정 취소</button>}<button className="button button-primary" disabled={saving} onClick={prepareSave}>{editing ? '수정 내용 저장' : '정산 저장'}</button></div></div>
    <div className="rule-notice"><span className="fee-tag">수수료 5%</span><p>택배·교환 모두 동일 · 사고는 해당 트라이에만 적용</p></div>
    <SaveError message={error || recordsStore.error} attempt={attempt} />
    {notice && <p className="success-message" role="status">{notice}</p>}
    <SettlementEditor data={data} onChange={onChange} onImport={loadRecent} />
    <div className="editor-bottom-actions"><p className="draft-note">‘{editing ? '수정 내용 저장' : '정산 저장'}’을 누르면 브라우저를 다시 열어도 기록이 유지됩니다. 저장 전 입력·변경은 새로고침하면 사라집니다.</p><button className="button button-primary" disabled={saving} onClick={prepareSave}>{editing ? '수정 내용 저장' : '정산 저장'}</button></div>
    {saving && !editing && <PasswordDialog mode="create" onCancel={() => setSaving(false)} onSubmit={async password => { const saved = await recordsStore.repository.create(data, password); recordsStore.refresh(); setSaving(false); notifySaved(); onSaved(saved) }} />}
  </main>
}

function EditRecord({ session, store }) {
  const [data, setData] = useState(() => migrateSettlement(session.record.data))
  const cancel = () => { window.location.hash = `/history/${session.record.id}` }
  return <EditorPage data={data} onChange={setData} recordsStore={store} editing onCancel={cancel} onImport={(kind, source) => setData(current => kind === 'roster' ? importRoster(current, source) : importRes(current, source))} onSaved={() => { store.repository.update(session.record.id, data, session.permit); store.refresh(); window.location.hash = `/history/${session.record.id}` }} />
}

function DetailRecord({ record, onUnlock }) {
  const [unlocking, setUnlocking] = useState(false)
  return <main id="main" className="page-container service-page"><a className="back-link" href="#/history">← 지난 정산 내역</a><div className="service-title"><p className="section-kicker">SAVED SETTLEMENT</p><h1 tabIndex={-1}>정산 기록 상세</h1><p>{record.data.date} · {modeLabel(record.data.mode)}</p></div><div className="saved-record-bar"><span>저장된 기록 · 읽기 전용 <small>수정 {record.revision - 1}회</small></span><button className="button button-secondary" onClick={() => setUnlocking(true)}>수정하기</button></div>
    <SettlementEditor data={record.data} savedResult={restoreResult(record.result)} readOnly />
    {unlocking && <PasswordDialog onCancel={() => setUnlocking(false)} onSubmit={async password => { await onUnlock(record.id, password); setUnlocking(false) }} />}
  </main>
}

export default function Services({ route }) {
  const store = useRecords()
  const [drafts, setDrafts] = useState(() => Object.fromEntries(MODES.map(mode => [mode, createSettlement(mode)])))
  const [session, setSession] = useState(null)
  useEffect(() => {
    const lockOnNavigation = () => {
      if (session && window.location.hash !== `#/history/${session.record.id}/edit`) {
        store.repository.revoke(session.permit)
        setSession(null)
      }
    }
    window.addEventListener('hashchange', lockOnNavigation)
    return () => window.removeEventListener('hashchange', lockOnNavigation)
  }, [session, store.repository])
  if (route === '/') return null
  if (route === '/rooms' || route.startsWith('/room/')) return <Rooms route={route} />
  if (route === '/bosses') return <BossMenus />
  if (route === '/history') return <HistoryList records={store.records} error={store.error} />
  const detail = route.match(/^\/history\/([^/]+)(\/edit)?$/)
  if (detail) {
    const record = store.records.find(value => value.id === detail[1])
    if (record && detail[2] && session?.record.id === record.id) return <EditRecord key={record.id} session={session} store={store} />
    if (record) return <DetailRecord key={record.id} record={record} onUnlock={async (id, password) => { const next = await store.repository.unlock(id, password); setSession(next); window.location.hash = `/history/${id}/edit` }} />
    return <main id="main" className="page-container service-page"><div className="service-title"><h1 tabIndex={-1}>정산 기록을 찾을 수 없습니다.</h1><p>{store.error || '같은 브라우저에 저장된 기록인지 확인해주세요.'}</p></div><a className="button button-secondary" href="#/history">지난 정산 내역</a></main>
  }
  const mode = route.slice(1)
  if (MODES.includes(mode)) {
    const change = next => setDrafts(current => ({ ...current, [mode]: next }))
    return <EditorPage key={mode} data={drafts[mode]} onChange={change} recordsStore={store} onSaved={record => { window.location.hash = `/history/${record.id}` }} onImport={(kind, source) => change(kind === 'roster' ? importRoster(drafts[mode], source) : importRes(drafts[mode], source))} />
  }
  return <main id="main" className="page-container service-page"><div className="service-title"><h1 tabIndex={-1}>정산 메뉴를 선택해주세요.</h1><p>이 주소에 해당하는 정산 화면이 없습니다.</p></div><a className="button button-primary" href="#/bosses">보스 선택하기 →</a></main>
}
