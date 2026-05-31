import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'

export function DocsProvider({ children }: { children: ReactNode }) {
  // Search disabled for the first static-export pass (no server search route).
  return <RootProvider search={{ enabled: false }}>{children}</RootProvider>
}
