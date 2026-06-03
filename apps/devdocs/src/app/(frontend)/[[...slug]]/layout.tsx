import { DocsProvider } from '@/components/docs/DocsProvider'
import { DocsLayoutShell } from '@/components/docs/DocsLayoutShell'
import { SITE_NAME, SITE_TAGLINE, SITE_TITLE_TEMPLATE } from '@/config/site'
import { getScopedPageTree } from '@/lib/docs-navigation'
import { source } from '@/lib/source'
import type { ReactNode } from 'react'

export const metadata = {
  title: {
    default: SITE_NAME,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_TAGLINE,
}

type LayoutProps = {
  children: ReactNode
  params: Promise<{ slug?: string[] }>
}

export default async function Layout({ children, params }: LayoutProps) {
  const { slug } = await params

  return (
    <DocsProvider>
      <DocsLayoutShell tree={getScopedPageTree(source.getPageTree(), slug)}>
        {children}
      </DocsLayoutShell>
    </DocsProvider>
  )
}
