import { useEffect, useRef, useState } from 'react'
import './feedback.css'

export function SaveToast() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let timer
    const show = () => { setVisible(true); clearTimeout(timer); timer = setTimeout(() => setVisible(false), 5000) }
    window.addEventListener('settlement-saved', show)
    return () => { window.removeEventListener('settlement-saved', show); clearTimeout(timer) }
  }, [])
  return <div className="save-toast-region" role="status" aria-live="polite" aria-atomic="true">{visible && <div className="save-toast"><span aria-hidden="true">✓</span> 정산이 저장되었습니다.<button type="button" aria-label="저장 알림 닫기" onClick={() => setVisible(false)}>×</button></div>}</div>
}

export function SaveError({ message, attempt }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!message || !node) return
    const bounds = node.getBoundingClientRect()
    if (bounds.top < 24 || bounds.bottom > window.innerHeight - 24) {
      node.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [message, attempt])
  return message ? <p ref={ref} className="field-error page-message save-error" role="alert">{message}</p> : null
}

export function ScrollTable({ children, ...props }) {
  const ref = useRef(null)
  const [overflow, setOverflow] = useState(false)
  const [used, setUsed] = useState(false)
  useEffect(() => {
    const node = ref.current
    const measure = () => setOverflow(node.scrollWidth > node.clientWidth + 1)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(node)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return <div className="scroll-table-wrap">{overflow && !used && <p className="table-scroll-hint">← 좌우로 스크롤 →</p>}<div {...props} ref={ref} className="sales-table-scroll" onScroll={event => { if (event.currentTarget.scrollLeft > 0) setUsed(true) }}>{children}</div></div>
}
