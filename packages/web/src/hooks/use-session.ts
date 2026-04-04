import { useAtom, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { sessionAtom, sessionLoadedAtom } from '../lib/atoms/session'
import { api } from '../lib/api'

interface SessionUserResponse {
  id: string
  username: string
  name?: string
  email?: string
  avatar?: string
}

export function useSession() {
  const [session, setSession] = useAtom(sessionAtom)
  const setLoaded = useSetAtom(sessionLoadedAtom)

  useEffect(() => {
    api
      .get<{ user: SessionUserResponse }>('/api/auth/me')
      .then((data) => {
        setSession({ user: data.user })
        setLoaded(true)
      })
      .catch(() => {
        setSession({ user: undefined })
        setLoaded(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return session
}
