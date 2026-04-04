import { HomePageContent } from '@/components/home-page-content'
import { useAtomValue } from 'jotai'
import { sessionAtom } from '@/lib/atoms/session'

export function HomePage() {
  const session = useAtomValue(sessionAtom)

  return <HomePageContent user={session.user ?? null} />
}
