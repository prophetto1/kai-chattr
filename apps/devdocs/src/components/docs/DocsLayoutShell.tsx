import type { ReactNode } from 'react'
import type * as PageTree from 'fumadocs-core/page-tree'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'

import { getDocTabs } from '@/lib/docs-navigation'
import { baseOptions } from '@/lib/layout.shared'

type Props = {
  children: ReactNode
  tree: PageTree.Root
}

export function DocsLayoutShell({ children, tree }: Props) {
  const { nav, ...shared } = baseOptions()

  return (
    <DocsLayout
      {...shared}
      nav={{ ...nav, mode: 'top' }}
      tabMode="navbar"
      tabs={getDocTabs()}
      tree={tree}
      sidebar={{ prefetch: false, defaultOpenLevel: 99, collapsible: false }}
    >
      {children}
    </DocsLayout>
  )
}
