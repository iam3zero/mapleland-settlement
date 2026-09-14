import { useEffect, useState } from 'react'

export function useHashRoute() {
  const getRoute = () => window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : window.location.pathname?.startsWith('/room/') && !window.location.hash ? window.location.pathname : '/'
  const [route, setRoute] = useState(getRoute)
  useEffect(() => {
    const update = () => setRoute(getRoute())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    if (window.location.hash === '#features') {
      document.getElementById('features')?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
      document.querySelector('main h1')?.focus({ preventScroll: true })
    }
  }, [route])
  return route
}
