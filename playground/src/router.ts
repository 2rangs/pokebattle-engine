import { useEffect, useState } from 'react'

/** '#/docs/engine' → '/docs/engine'. 정적 호스팅에서도 동작하도록 해시 라우팅 */
export function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
