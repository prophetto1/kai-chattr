import { type ComponentType, type ReactNode, useCallback, useMemo } from 'react'
import { IconFolderCode } from '@tabler/icons-react'

import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree'

export type WorkspaceTreeEntry = {
  path: string
  additions?: number
  deletions?: number
  status?: 'added' | 'modified' | 'deleted'
}

type TreeNode = {
  name: string
  path: string
  children: Map<string, TreeNode>
  entry?: WorkspaceTreeEntry
  additions: number
  deletions: number
}

const EXPAND_ALL_FOLDER_LIMIT = 64

function buildTree(rootName: string, entries: WorkspaceTreeEntry[]): TreeNode {
  const root: TreeNode = {
    additions: 0,
    children: new Map(),
    deletions: 0,
    name: rootName,
    path: '.',
  }
  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean)
    if (parts.length === 0) {
      continue
    }
    root.additions += entry.additions ?? 0
    root.deletions += entry.deletions ?? 0
    let node = root
    let prefix = ''
    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part
      let child = node.children.get(part)
      if (!child) {
        child = { additions: 0, children: new Map(), deletions: 0, name: part, path: prefix }
        node.children.set(part, child)
      }
      child.additions += entry.additions ?? 0
      child.deletions += entry.deletions ?? 0
      if (index === parts.length - 1) {
        child.entry = entry
      }
      node = child
    })
  }
  return root
}

function collectFolderKeys(node: TreeNode, keys: string[]) {
  if (node.children.size === 0) {
    return
  }
  keys.push(`dir:${node.path}`)
  for (const child of node.children.values()) {
    collectFolderKeys(child, keys)
  }
}

function renderNode(node: TreeNode, showStats: boolean): ReactNode {
  if (node.children.size === 0) {
    return (
      <FileTreeFile
        additions={showStats ? node.entry?.additions : undefined}
        deletions={showStats ? node.entry?.deletions : undefined}
        key={node.path}
        name={node.name}
        path={node.path}
        status={node.entry?.status}
      />
    )
  }

  const children = [...node.children.values()].sort((a, b) => {
    const aFolder = a.children.size > 0
    const bFolder = b.children.size > 0
    if (aFolder !== bFolder) {
      return aFolder ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return (
    <FileTreeFolder
      additions={showStats && node.additions > 0 ? node.additions : undefined}
      deletions={showStats && node.deletions > 0 ? node.deletions : undefined}
      key={`dir:${node.path}`}
      name={node.name}
      path={`dir:${node.path}`}
    >
      {children.map((child) => renderNode(child, showStats))}
    </FileTreeFolder>
  )
}

export function WorkspaceFileTree({
  emptyText = 'No files.',
  entries,
  headerIcon: HeaderIcon = IconFolderCode,
  headerLabel,
  onSelect,
  rootName,
  selectedPath,
  showStats = false,
}: {
  emptyText?: string
  entries: WorkspaceTreeEntry[]
  headerIcon?: ComponentType<{ className?: string }>
  headerLabel: string
  onSelect: (path: string) => void
  rootName: string
  selectedPath: string
  showStats?: boolean
}) {
  const filePaths = useMemo(() => new Set(entries.map((entry) => entry.path)), [entries])
  const tree = useMemo(() => buildTree(rootName, entries), [entries, rootName])
  const defaultExpanded = useMemo(() => {
    const keys: string[] = []
    collectFolderKeys(tree, keys)
    return new Set(keys.length <= EXPAND_ALL_FOLDER_LIMIT ? keys : ['dir:.'])
  }, [tree])

  const handleSelect = useCallback(
    (path: string) => {
      if (filePaths.has(path)) {
        onSelect(path)
      }
    },
    [filePaths, onSelect]
  )

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      data-testid="workspace-tree"
    >
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/25 px-2 text-[11px]">
        <HeaderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium text-foreground">{headerLabel}</span>
        {showStats && (tree.additions > 0 || tree.deletions > 0) ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums">
            <span className="text-emerald-500">+{tree.additions}</span>
            <span className="text-red-400">-{tree.deletions}</span>
          </span>
        ) : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted-foreground">{emptyText}</p>
        ) : (
          <FileTree
            className="min-h-full max-w-full rounded-none border-0 bg-transparent"
            defaultExpanded={defaultExpanded}
            density="compact"
            key={[...defaultExpanded].join('|')}
            onSelect={handleSelect}
            selectedPath={selectedPath}
            showGuides={false}
            showStats={showStats}
          >
            {renderNode(tree, showStats)}
          </FileTree>
        )}
      </div>
    </div>
  )
}
