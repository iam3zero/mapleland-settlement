import { IconPicker, RoomDirectory } from './RoomDirectory.jsx'
import AllRooms from './AllRooms.jsx'
import { roomIcon } from './icons.js'
import { visitedRooms } from './visitedRooms.js'
import { SaveError } from '../settlement/feedback'
import { notifySaved } from '../settlement/notifications'
import { validateNewPassword } from '../settlement/auth'
import { useEffect, useState } from 'react'
import SettlementEditor from '../settlement/SettlementEditor.jsx'
import { PasswordDialog } from '../settlement/History.jsx'
import { Money } from '../settlement/shared.jsx'
import { createSettlement, importRes, importRoster, migrateSettlement, modeLabel, MODES, restoreResult, validateForSave } from '../settlement/model.js'
import { configureRoomRepository } from './repository.js'
import { normalizeRoomCode, roomLink } from './domain.js'
import './rooms.css'

function StorageNotice({ mode }) {
  return <p className={`room-storage-note ${mode === 'supabase' ? 'cloud' : ''}`}>{mode === 'supabase' ? '☁️ 클라우드 정산방 · 방 코드를 공유하면 다른 기기에서도 정산 내역을 확인할 수 있습니다.' : '브라우저 저장 모드 · 이 모드의 기록은 현재 브라우저에 저장됩니다.'}</p>
}
function RoomEntrance({ service, mode, onCreated }) {
  const [code, setCode] = useState('')
  const [icon, setIcon] = useState('\uD83C\uDF41')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <main id="main" className="page-container service-page"><a className="back-link" href="#/">← 홈으로</a><div className="service-title"><p className="section-kicker">SETTLEMENT ROOM</p><h1 tabIndex={-1}>우리 공대의 정산방</h1><p>로그인 없이 만들고, 방 코드로 함께 확인하세요.</p></div><StorageNotice mode={mode} />
    <SaveError message={error} />
    <div className="room-entry-grid"><section className="editor-card"><h2>정산방 입장</h2><p className="allocation-help">전달받은 영문·숫자 6자리 코드를 입력해주세요.</p><form className="room-form" onSubmit={event => { event.preventDefault(); try { window.location.hash = `/room/${normalizeRoomCode(code)}` } catch (reason) { setError(reason.message) } }}><label>방 코드<input className="text-input room-code-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="A7K3P9" required /></label><button className="button button-primary">입장하기 →</button></form></section>
    <section className="editor-card"><h2>정산방 만들기</h2><p className="allocation-help">한 방에 여러 번의 정산을 모아둘 수 있어요.</p><form className="room-form" noValidate onSubmit={async event => { event.preventDefault(); if (busy) return; try { validateNewPassword(password) } catch (reason) { setError(reason.message); return } if (password !== confirm) { setError('비밀번호 확인이 일치하지 않습니다.'); return } setBusy(true); setError(''); try { const result = await service.createRoom({ roomName: name, password, icon }); setPassword(''); setConfirm(''); onCreated(result) } catch (reason) { setError(reason.message); setBusy(false) } }}><IconPicker value={icon} onChange={setIcon} disabled={busy} /><label>방 이름<input className="text-input" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="○○길드 자쿰 공대" disabled={busy} required /></label><label>수정 비밀번호<input className="text-input" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={4} maxLength={8} autoComplete="new-password" disabled={busy} required /></label><label>비밀번호 확인<input className="text-input" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={4} maxLength={8} autoComplete="new-password" disabled={busy} required /></label><p className="allocation-help">4~8자 · 방의 모든 정산 작성·수정에 사용합니다. 비밀번호 분실 복구는 지원하지 않습니다.</p><button className="button button-primary" disabled={busy}>{busy ? '정산방 만드는 중…' : '정산방 생성'}</button></form></section></div>
    <p className="draft-note">기존에 저장한 개인 정산은 <a href="#/history">지난 정산 내역</a>에서 계속 조회·수정할 수 있습니다.</p>
    <RoomDirectory service={service} mode={mode} />
    <AllRooms service={service} mode={mode} />
  </main>
}

function RoomEditor({ code, record, mode, service, access, bundle, onSaved, onUnlock }) {
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState(() => record ? migrateSettlement(record.data) : createSettlement(mode))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const recent = kind => {
    const source = [...bundle.settlements].filter(value => value.data.mode === 'normal/raid').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (!source) { setNotice('이 정산방에 저장된 노멀 외판공대 기록이 없습니다.'); return }
    setData(current => kind === 'roster' ? importRoster(current, source.data) : importRes(current, source.data))
    setNotice(`${source.data.date} 기록의 ${kind === 'roster' ? '공대원 명단' : '리저 비용'}을 불러왔습니다.`)
  }
  const save = async () => {
    if (busy) return
    setAttempt(value => value + 1)
    setBusy(true); setError('')
    try { validateForSave(data); const saved = await service.saveSettlement(code, access.token, data, record ? { settlementId: record.settlementId, revision: record.revision } : {}); notifySaved(); await onSaved(saved) }
    catch (reason) { setError(reason.message); setBusy(false) }
  }
  return <><div className="service-title"><p className="section-kicker">{roomIcon(bundle.room.icon)} {bundle.room.roomName}</p><h1 tabIndex={-1}>{record ? '정산 수정' : '새 정산 작성'}</h1><p>{modeLabel(data.mode)} · 공대 전체 1트 / 2트</p></div><div className="editor-toolbar"><label>정산 날짜<input className="text-input" type="date" value={data.date} disabled={busy} onChange={event => setData({ ...data, date: event.target.value })} /></label><div><button className="button button-secondary" onClick={onUnlock} disabled={busy}>관리자 다시 확인</button><button className="button button-primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : record ? '수정 내용 저장' : '정산방에 저장'}</button></div></div>
    <SaveError message={error} attempt={attempt} />{notice && <p className="success-message" role="status">{notice}</p>}
    <fieldset className="room-editor-fieldset" disabled={busy}><SettlementEditor data={data} onChange={setData} onImport={recent} /></fieldset><div className="editor-bottom-actions"><p className="draft-note">저장 전 변경은 새로고침하면 사라집니다. 수정 권한은 확인 후 15분 동안 유효합니다.</p><button className="button button-primary" disabled={busy} onClick={save}>{record ? '수정 내용 저장' : '정산방에 저장'}</button></div></>
}

export default function Rooms({ route, configuration }) {
  const [config] = useState(() => {
    try { let storage; try { storage = window.localStorage } catch { /* Repository shows the storage error. */ } return configuration ?? configureRoomRepository(import.meta.env, storage) }
    catch (error) { return { error: error.message } }
  })
  const [loaded, setLoaded] = useState(null)
  const [access, setAccess] = useState(null)
  const [unlockTarget, setUnlockTarget] = useState(null)
  const [copyNotice, setCopyNotice] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const parts = route.split('/').filter(Boolean)
  const code = parts[0] === 'room' ? parts[1]?.toUpperCase() : null
  const service = config.service
  useEffect(() => {
    let active = true
    if (code && service) service.getRoom(code).then(bundle => { if (active) { setLoaded({ code, bundle }); try { visitedRooms(window.localStorage, config.mode).remember(code) } catch { /* Directory reports unavailable storage. */ } } }).catch(error => { if (active) setLoaded({ code, error: error.message }) })
    return () => { active = false }
  }, [code, service, config.mode])
  if (config.error) return <main id="main" className="page-container service-page"><h1 tabIndex={-1}>정산방 연결 설정이 필요합니다.</h1><p className="field-error">{config.error}</p><a className="back-link" href="#/">← 홈으로</a></main>
  if (!code) return <RoomEntrance service={service} mode={config.mode} onCreated={result => { try { visitedRooms(window.localStorage, config.mode).remember(result.room.roomCode) } catch { /* Optional browser shortcut. */ } setAccess({ code: result.room.roomCode, token: result.token, expiresAt: result.expiresAt }); window.location.hash = `/room/${result.room.roomCode}` }} />
  const bundle = loaded?.code === code ? loaded.bundle : null
  const error = loaded?.code === code ? loaded.error : null
  const base = `/room/${code}`
  const authorized = access?.code === code
  const record = bundle?.settlements.find(value => value.settlementId === parts[3])
  const isNew = parts[2] === 'new' && MODES.includes(`${parts[3]}/${parts[4]}`)
  const isEdit = parts[2] === 'settlement' && parts[4] === 'edit' && record
  const unknown = parts[2] && !isNew && !(parts[2] === 'settlement' && record)
  const askUnlock = target => setUnlockTarget(target)
  const moveToEditor = target => { if (authorized) window.location.hash = target; else askUnlock(target) }
  return <main id="main" className="page-container service-page"><a className="back-link" href={parts[2] ? `#${base}` : '#/rooms'}>← {parts[2] ? '정산방으로' : '정산방 입장'}</a><StorageNotice mode={config.mode} />
    {!bundle && !error && <p className="allocation-help" role="status">정산방을 불러오는 중입니다…</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {bundle && <>
      {unknown ? <div className="service-title"><h1 tabIndex={-1}>정산 기록을 찾을 수 없습니다.</h1></div> : (isNew || isEdit) && authorized ? <RoomEditor key={`${code}-${record?.settlementId ?? 'new-' + parts[3] + '-' + parts[4]}`} code={code} record={isEdit ? record : null} mode={`${parts[3]}/${parts[4]}`} service={service} access={access} bundle={bundle} onUnlock={() => askUnlock(route)} onSaved={saved => { const settlements = bundle.settlements.some(value => value.settlementId === saved.settlementId) ? bundle.settlements.map(value => value.settlementId === saved.settlementId ? saved : value) : [saved, ...bundle.settlements]; settlements.sort((a, b) => b.data.date.localeCompare(a.data.date) || b.updatedAt.localeCompare(a.updatedAt)); setLoaded({ code, bundle: { room: { ...bundle.room, updatedAt: saved.updatedAt }, settlements } }); window.location.hash = `${base}/settlement/${saved.settlementId}` }} /> : (isNew || isEdit) ? <div className="service-title"><h1 tabIndex={-1}>관리자 확인이 필요합니다.</h1><p>정산 작성·수정은 방의 수정 비밀번호를 확인한 뒤 이용할 수 있습니다.</p><button className="button button-primary" onClick={() => askUnlock(route)}>관리자 비밀번호 확인</button></div> : record ? <>
        <div className="service-title"><p className="section-kicker">{bundle.room.roomName}</p><h1 tabIndex={-1}>정산 기록 상세</h1><p>{record.data.date} · {modeLabel(record.data.mode)}</p></div><div className="saved-record-bar"><span>공유 정산 · 읽기 전용</span><button className="button button-secondary" onClick={() => askUnlock(`${base}/settlement/${record.settlementId}/edit`)}>수정하기</button></div><SettlementEditor data={record.data} savedResult={restoreResult(record.result)} readOnly />
      </> : <>
        <div className="service-title"><p className="section-kicker">SETTLEMENT ROOM</p><h1 tabIndex={-1}>{bundle.room.roomName}</h1><p>공대의 정산을 한곳에 모아 확인하세요.</p></div>
        <section className="room-share-card"><div><span>방 코드</span><strong>{bundle.room.roomCode}</strong></div><div className="room-share-link"><label>공유 링크<input className="text-input" readOnly value={roomLink(code)} onFocus={event => event.target.select()} /></label><button className="button button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(roomLink(code)); setCopyNotice(config.mode === 'local' ? '링크를 복사했습니다. 현재는 같은 브라우저에서만 열립니다.' : '공유 링크를 복사했습니다.') } catch { setCopyNotice('자동 복사가 지원되지 않습니다. 링크를 선택해 직접 복사해주세요.') } }}>링크 복사</button></div></section>
        {copyNotice && <p className="success-message" role="status">{copyNotice}</p>}
        <button type="button" className="text-button" onClick={() => { setNewName(bundle.room.roomName); setRenaming(true) }}>정산방 이름 수정</button>
        <details className="room-new-options"><summary>+ 새 정산 작성</summary><div>{MODES.map(mode => <button className="button button-secondary" key={mode} onClick={() => moveToEditor(`${base}/new/${mode}`)}>{modeLabel(mode)}</button>)}</div></details>
        {authorized && <div className="room-admin-state"><span>관리자 확인됨 · 15분 유효</span><button className="text-button" onClick={async () => { try { await service.revoke(access.token); setAccess(null) } catch { setCopyNotice('관리자 권한 종료에 실패했습니다. 다시 시도해주세요.') } }}>관리자 권한 종료</button></div>}
        <div className="section-heading"><h2>지난 정산</h2><span className="count-badge">{bundle.settlements.length}개</span></div><div className="history-list">{bundle.settlements.map(value => <a key={value.settlementId} className="history-card" href={`#${base}/settlement/${value.settlementId}`}><div><time>{value.data.date}</time><h2>{modeLabel(value.data.mode)}</h2><p>공대원 {value.data.members.length}명</p></div><div className="history-amount"><span>최종 정산금</span><strong><Money value={BigInt(value.result.total.final)} /></strong></div></a>)}</div>
        {!bundle.settlements.length && <p className="history-empty">아직 정산이 없습니다. 새 정산을 작성해보세요.</p>}
        {authorized && <details className="room-danger"><summary>정산방 관리</summary><p>정산방 삭제는 되돌릴 수 없습니다. 관리자 비밀번호를 다시 확인합니다.</p><button type="button" className="text-button" onClick={() => setDeleting(true)}>정산방 삭제</button></details>}
        {!authorized && <button className="text-button" onClick={() => askUnlock(base)}>관리자 비밀번호 확인</button>}
      </>}
    </>}
    <RoomDirectory service={service} mode={config.mode} currentRoom={bundle?.room} revision={bundle?.settlements} />
    <AllRooms service={service} mode={config.mode} revision={bundle} />
    {renaming && bundle && <PasswordDialog title="정산방 이름 수정" description="새 이름과 관리자 비밀번호를 입력해주세요." submitLabel="변경하기" cloud={config.mode === 'supabase'} onCancel={() => setRenaming(false)} onSubmit={async password => {
      if (!newName.trim() || newName.trim().length > 60) throw new Error('방 이름을 1~60자로 입력해주세요.')
      const next = await service.unlock(code, password)
      const room = await service.renameRoom(code, next.token, password, newName)
      setAccess({ code, ...next }); setLoaded({ code, bundle: { ...bundle, room } }); setRenaming(false)
      notifySaved('정산방 이름이 변경되었습니다.')
    }}><label>새 정산방 이름<input className="text-input" value={newName} maxLength={60} required onChange={event => setNewName(event.target.value)} /></label></PasswordDialog>}
    {deleting && bundle && <PasswordDialog title="정산방을 삭제하시겠습니까?" description="삭제하면 해당 정산방과 저장된 모든 정산 기록을 다시 복구할 수 없습니다. 계속하려면 관리자 비밀번호를 입력해주세요." submitLabel="삭제" cloud={config.mode === 'supabase'} onCancel={() => setDeleting(false)} onSubmit={async password => {
      await service.deleteRoom(code, access?.token, password)
      try { visitedRooms(window.localStorage, config.mode).forget(code) } catch { /* Deleted codes are also removed when refreshing the directory. */ }
      setDeleting(false); setAccess(null); setLoaded(null); window.location.hash = '/rooms'
    }} />}
    {unlockTarget && <PasswordDialog title="정산방 관리자 확인" cloud={config.mode === 'supabase'} onCancel={() => setUnlockTarget(null)} onSubmit={async password => { const next = await service.unlock(code, password); setAccess({ code, ...next }); const target = unlockTarget; setUnlockTarget(null); window.location.hash = target }} />}
  </main>
}

