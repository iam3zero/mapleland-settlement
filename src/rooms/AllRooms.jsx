import { useEffect, useId, useRef, useState } from 'react'
import { roomIcon } from './icons.js'
import { normalizeRoomCode } from './domain.js'

function RoomEntryDialog({ room, service, onCancel }) {
  const ref = useRef(null)
  const id = useId()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="notice-dialog password-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id={`${id}-title`}>정산방 입장</h2><p>{roomIcon(room.icon)} {room.roomName}</p><p>해당 정산방의 코드를 입력해주세요.</p>
    <form noValidate onSubmit={async event => {
      event.preventDefault(); if (busy) return
      setBusy(true); setError('')
      try {
        const normalized = normalizeRoomCode(code)
        await service.enterRoom(room.roomId, normalized)
        window.location.hash = `/room/${normalized}`
        onCancel()
      } catch (reason) { setError(reason.message); setBusy(false) }
    }}>
      <label>6자리 방 코드<input className="text-input room-code-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} autoComplete="off" autoCapitalize="characters" autoFocus disabled={busy} required /></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>취소</button><button className="button button-primary" disabled={busy}>{busy ? '확인 중…' : '입장하기'}</button></div>
    </form>
  </dialog>
}

// Public cloud directory: deliberately independent of browser visit history.
export default function AllRooms({ service, mode, revision }) {
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState({ rooms: [], hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    if (mode !== 'supabase') return
    let active = true
    let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      setLoading(true)
      try {
        const next = await service.listAllRooms(offset)
        if (active) { setPage(next); setError('') }
      } catch (reason) { if (active) setError(reason.message) }
      finally { pending = false; if (active) setLoading(false) }
    }
    load()
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [service, mode, offset, revision])
  return <section className="room-directory all-rooms" aria-label="모든 정산방">
    <div className="section-heading"><h2>모든 정산방</h2></div>
    <p className="allocation-help">메랜정산에서 생성된 정산방을 확인할 수 있습니다.</p>
    {mode !== 'supabase' ? <p className="allocation-help">공개 정산방 목록은 클라우드 모드에서 제공됩니다.</p> : <>
      {loading && <p className="allocation-help" role="status">정산방 목록을 불러오는 중입니다…</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {!error && <div className="room-directory-grid all-rooms-grid">{page.rooms.map(room => <article className="room-directory-card" key={room.roomId}>
        <span className="room-icon-preview" aria-hidden="true">{roomIcon(room.icon)}</span>
        <div><h3>{room.roomName}</h3><p>{room.latestSettlementDate ? '최근 정산' : '방 생성'} <time>{(room.latestSettlementDate ?? room.createdAt.slice(0, 10)).replaceAll('-', '.')}</time></p></div>
        <button type="button" className="button button-secondary" onClick={() => setSelected(room)}>입장하기</button>
      </article>)}</div>}
      {!loading && !error && !page.rooms.length && <p className="allocation-help">표시할 정산방이 없습니다.</p>}
      <div className="all-rooms-pagination">
        {offset > 0 && <button className="button button-secondary" disabled={loading} onClick={() => setOffset(value => Math.max(0, value - 30))}>이전 30개</button>}
        {page.hasMore && <button className="button button-secondary" disabled={loading} onClick={() => setOffset(value => value + 30)}>다음 30개</button>}
      </div>
    </>}
    {selected && <RoomEntryDialog room={selected} service={service} onCancel={() => setSelected(null)} />}
  </section>
}
