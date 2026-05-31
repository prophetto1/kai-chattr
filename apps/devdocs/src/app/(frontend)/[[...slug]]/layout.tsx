import { DocsProvider } from '@/components/docs/DocsProvider'
import { DocsLayoutShell } from '@/components/docs/DocsLayoutShell'
import { source } from '@/lib/source'
import type { ReactNode } from 'react'

export const metadata = {
  title: {
    default: 'kai · chattr docs',
    template: '%s · kai · chattr docs',
  },
  description:
    'Governance and architecture for the kai-chattr coordination room.',
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsProvider>
      <DocsLayoutShell tree={source.getPageTree()}>{children}</DocsLayoutShell>
    </DocsProvider>
  )
}
