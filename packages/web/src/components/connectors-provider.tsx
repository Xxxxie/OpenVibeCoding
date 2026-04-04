// Stub: Connectors provider
import { createContext, useContext } from 'react'

interface Connector {
  id: string
  name: string
  status: string
}

interface ConnectorsContextType {
  connectors: Connector[]
}

const ConnectorsContext = createContext<ConnectorsContextType>({ connectors: [] })

export function ConnectorsProvider({ children }: { children: React.ReactNode }) {
  return <ConnectorsContext.Provider value={{ connectors: [] }}>{children}</ConnectorsContext.Provider>
}

export function useConnectors() {
  return useContext(ConnectorsContext)
}
