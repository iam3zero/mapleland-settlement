import { useEffect, useState } from 'react'
import { roomIcon, ROOM_ICONS } from './icons.js'
import { sortRooms } from './domain.js'
import { visitedRooms } from './visitedRooms.js'

export function IconPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  return <div className="room-icon-picker"><span className="room-icon-preview" aria-label="선택한 정산방 아이콘">{roomIcon(value)}</span><button type="button" className="button button-secondary" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>아이콘 변경</button>{open && <div className="room-icon-options" role="group" aria-label="정산방 아이콘 선택">{ROOM_ICONS.map(icon => <button type="button" disabled={disabled} key={icon} aria-label={`아이콘 ${icon}`} aria-pressed={value === icon} onClick={() => { onChange(icon); setOpen(false) }}>{icon}</button>)}</div>}</div>
}

export function RoomDirectory({ service, mode, currentRoom, revision }) {
  const [rooms, setRooms] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    let storage
    try { storage = window.localStorage } catch { /* The directory can still show the current room. */ }
    const registry = visitedRooms(storage, mode)
    const remembered = currentRoom ? registry.remember(currentRoom.roomCode) : true
    const codes = [...new Set([...(currentRoom ? [currentRoom.roomCode] : []), ...registry.read()])].slice(0, 30)
    const load = () => service.listRooms(codes).then(values => {
      if (!active) return
      // A public directory response must never populate personal shortcuts.
      setRooms(sortRooms(values.filter(room => codes.includes(room.roomCode)))); setLoading(false)
      setError(remembered ? '' : '방문한 방 목록을 이 브라우저에 기억할 수 없습니다. 방 코드나 공유 링크를 보관해주세요.')
      for (const code of codes) if (!values.some(room => room.roomCode === code)) registry.forget(code)
    }).catch(reason => { if (active) { setError(reason.message); setLoading(false) } })
    load()
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [service, mode, currentRoom, revision])
  return <section className="room-directory"><div className="section-heading"><h2>우리 공대 정산방</h2><span className="count-badge">{rooms.length}개</span></div><p className="allocation-help">이 브라우저에서 생성하거나 방문한 최근 30개 방입니다. 다른 기기에서는 공유 링크 또는 방 코드로 한 번 입장해주세요.</p>{error && <p className="field-error" role="alert">{error}</p>}{loading && <p className="allocation-help" role="status">정산방 목록을 불러오는 중입니다…</p>}<div className="room-directory-grid">{rooms.map(room => <article className="room-directory-card" key={room.roomId}><span className="room-icon-preview" aria-hidden="true">{roomIcon(room.icon)}</span><div><h3>{room.roomName}</h3><p>{room.latestSettlementDate ? '최근 정산' : '방 생성'} <time>{(room.latestSettlementDate ?? room.createdAt.slice(0, 10)).replaceAll('-', '.')}</time></p></div><a className="button button-secondary" href={`#/room/${room.roomCode}`}>입장하기</a></article>)}</div>{!loading && !error && !rooms.length && <p className="allocation-help">아직 방문한 정산방이 없습니다.</p>}</section>
}
