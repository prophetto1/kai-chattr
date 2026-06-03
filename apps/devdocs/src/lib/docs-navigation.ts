import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb'
import type * as PageTree from 'fumadocs-core/page-tree'
import type { ReactNode } from 'react'

export type DocSectionKey = 'home' | 'contracts' | 'implementation' | 'research'

type DocSection = {
  key: DocSectionKey
  title: string
  url: string
  matchUrls?: string[]
}

export const DOC_SECTIONS: DocSection[] = [
  {
    key: 'home',
    title: 'Home',
    url: '/',
    matchUrls: ['/'],
  },
  {
    key: 'contracts',
    title: 'Contracts',
    url: '/contracts/frontend',
    matchUrls: ['/contracts', '/contracts/frontend', '/contracts/backend', '/contracts/architecture'],
  },
  {
    key: 'implementation',
    title: 'Implementation',
    url: '/implementation/new-session/0601-phase-1',
    matchUrls: [
      '/implementation',
      '/implementation/new-session',
      '/implementation/new-session/0601-phase-1',
      '/implementation/new-session/0601-phase-1-review',
      '/implementation/frontend',
      '/implementation/frontend/closure-conformance-workflow',
      '/implementation/frontend/chat-history-stashing',
      '/implementation/agent-tools',
      '/implementation/agent-tools/hook-memory-upgrade-plan',
    ],
  },
  {
    key: 'research',
    title: 'Research',
    url: '/research/boundary-triggered-deliberation',
    matchUrls: [
      '/research',
      '/research/boundary-triggered-deliberation',
      '/research/positioning-and-prior-art',
    ],
  },
]

type TocItem = {
  depth?: number
  title?: ReactNode
  items?: TocItem[]
}

export function getDocTabs() {
  return DOC_SECTIONS.map((section) => ({
    title: section.title,
    url: section.url,
    urls: section.matchUrls ? new Set(section.matchUrls) : undefined,
  }))
}

export function getDocSection(slug: string[] | undefined): DocSection {
  const key = (slug?.[0] ?? 'home') as DocSectionKey
  return DOC_SECTIONS.find((section) => section.key === key) ?? DOC_SECTIONS[0]
}

export function getScopedPageTree(tree: PageTree.Root, slug: string[] | undefined): PageTree.Root {
  const expandedTree = expandSidebarTree(tree)
  const section = getDocSection(slug)

  if (section.key === 'home') {
    return {
      ...expandedTree,
      $id: `${expandedTree.$id ?? 'root'}-home`,
      children: [],
    }
  }

  const rootSection = findRootSection(expandedTree, section.key)

  if (!rootSection) {
    return expandedTree
  }

  return {
    ...expandedTree,
    $id: `${expandedTree.$id ?? 'root'}-${section.key}`,
    children: sectionChildren(rootSection),
  }
}

export function getPageBreadcrumb(
  tree: PageTree.Root,
  slug: string[] | undefined,
  url: string,
): ReactNode[] {
  const section = getDocSection(slug)

  if (section.key === 'home') {
    return []
  }

  return [
    section.title,
    ...getBreadcrumbItems(url, tree, { includePage: true }).map((item) => item.name),
  ]
}

export function getPageToc<T extends TocItem>(toc: T[], isHomePage: boolean): T[] {
  if (isHomePage) {
    return toc
  }

  return toc.flatMap((item) => {
    if (item.depth === 1) {
      return []
    }

    if (!item.items) {
      return [item]
    }

    return [
      {
        ...item,
        items: getPageToc(item.items, isHomePage),
      },
    ]
  }) as T[]
}

function expandSidebarFolder(node: PageTree.Node): PageTree.Node {
  if (node.type !== 'folder') {
    return node
  }

  const children = node.children.map(expandSidebarFolder)
  const index = node.index ?? findFolderIndex(children)

  return {
    ...node,
    collapsible: false,
    defaultOpen: true,
    index,
    children: index ? children.filter((child) => child !== index) : children,
  }
}

function expandSidebarTree(tree: PageTree.Root): PageTree.Root {
  return {
    ...tree,
    children: tree.children.map(expandSidebarFolder),
  }
}

function findFolderIndex(children: PageTree.Node[]): PageTree.Item | undefined {
  const pages = children.filter((child): child is PageTree.Item => child.type === 'page')

  return pages.find((page) => page.$ref?.endsWith('/index.mdx'))
}

function sectionChildren(section: PageTree.Folder): PageTree.Node[] {
  const children = section.children.flatMap((child) => {
    if (child.type === 'folder' && child.name === section.name && !child.index) {
      return child.children
    }

    return [child]
  })

  return section.index ? [section.index, ...children] : children
}

function nodeMatchesSection(node: PageTree.Node, section: DocSectionKey): boolean {
  if (node.type === 'page') {
    return node.url === `/${section}` || node.url.startsWith(`/${section}/`)
  }

  if (node.type === 'folder') {
    return (
      node.$ref?.folder === section ||
      node.index?.url === `/${section}` ||
      node.children.some((child) => nodeMatchesSection(child, section))
    )
  }

  return false
}

function findRootSection(tree: PageTree.Root, section: DocSectionKey): PageTree.Folder | undefined {
  return tree.children.find(
    (node): node is PageTree.Folder => node.type === 'folder' && nodeMatchesSection(node, section),
  )
}
