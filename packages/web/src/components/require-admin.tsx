import { useAtomValue } from 'jotai'
import { Navigate, useLocation } from 'react-router'
import { sessionAtom, sessionLoadedAtom } from '../lib/atoms/session'
import { Loader2 } from 'lucide-react'

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const session = useAtomValue(sessionAtom)
  const loaded = useAtomValue(sessionLoadedAtom)
  const location = useLocation()

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!session.user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (session.user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
