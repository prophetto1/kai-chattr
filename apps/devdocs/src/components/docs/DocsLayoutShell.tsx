import type { ReactNode } from 'react'
import type * as PageTree from 'fumadocs-core/page-tree'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'

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
      tree={tree}
      sidebar={{ prefetch: false }}
    >
      {children}
    </DocsLayout>
  )
}
