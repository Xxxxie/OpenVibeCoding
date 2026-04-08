// Stub: Connectors provider
import { createContext, useContext } from 'react'
import type { Connector } from '@/lib/session/types'

interface ConnectorsContextType {
  connectors: Connector[]
  refreshConnectors: () => Promise<void>
  isLoading: boolean
}

const ConnectorsContext = createContext<ConnectorsContextType>({
  connectors: [],
  refreshConnectors: async () => {},
  isLoading: false,
})

export function ConnectorsProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConnectorsContext.Provider
      value={{
        connectors: [],
        refreshConnectors: async () => {},
        isLoading: false,
      }}
    >
      {children}
    </ConnectorsContext.Provider>
  )
}

export function useConnectors() {
  return useContext(ConnectorsContext)
}
