import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import { type Session } from '@/lib/session/types'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'
import { useMemo } from 'react'

export function User(props: { user?: Session['user'] | null; authProvider?: Session['authProvider'] | null }) {
  const session = useAtomValue(sessionAtom)

  const user = useMemo(() => session.user ?? props.user ?? null, [session.user, props.user])
  const authProvider = useMemo(
    () => session.authProvider ?? props.authProvider ?? 'github',
    [session.authProvider, props.authProvider],
  )

  if (user) {
    return <SignOut user={user} authProvider={authProvider} />
  } else {
    return <SignIn />
  }
}
