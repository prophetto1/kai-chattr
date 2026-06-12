import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderCode,
  IconFolderOpen,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { Tree, type NodeRendererProps, type RowRendererProps } from 'react-arborist'

import { cn } from '@/lib/cn'
import { getTypographyRole, rowTypographyStyle, typographyStyle } from '@/lib/design-system'

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

type ArborNode = {
  id: string
  name: string
  children: ArborNode[] | null
  entry?: WorkspaceTreeEntry
  additions: number
  deletions: number
}

const EXPAND_ALL_FOLDER_LIMIT = 64
const ROW_HEIGHT_PX = 20
const ROW_INDENT_PX = 8
const fileListHeaderStyle = typographyStyle('workbench.fileListHeader')
const fileListMetaStyle = typographyStyle('workbench.fileRowMeta')
const fileListRowRole = getTypographyRole('workbench.fileRow')
const fileListRowStyle = rowTypographyStyle('workbench.fileRow')
const fileTreeStatStyle = typographyStyle('workbench.fileTreeStat')

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

function toArborNodes(node: TreeNode): ArborNode[] {
  return [...node.children.values()]
    .sort((a, b) => {
      const aFolder = a.children.size > 0
      const bFolder = b.children.size > 0
      if (aFolder !== bFolder) {
        return aFolder ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    .map((child) => {
      const isFolder = child.children.size > 0
      return {
        additions: child.additions,
        children: isFolder ? toArborNodes(child) : null,
        deletions: child.deletions,
        entry: child.entry,
        id: isFolder ? `dir:${child.path}` : child.path,
        name: child.name,
      }
    })
}

function collectFolderIds(nodes: ArborNode[], ids: string[]) {
  for (const node of nodes) {
    if (node.children) {
      ids.push(node.id)
      collectFolderIds(node.children, ids)
    }
  }
}

// Arborist's DefaultRow sets min-width: max-content, which makes rows grow
// horizontally instead of truncating names. Same row, width-pinned.
function CompactRow({ node, innerRef, attrs, children }: RowRendererProps<ArborNode>) {
  return (
    <div
      {...attrs}
      ref={innerRef}
      style={{ ...attrs.style, minWidth: 0 }}
      onClick={node.handleClick}
      onFocus={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}

function RowStats({
  additions,
  deletions,
  status,
}: {
  additions: number
  deletions: number
  status?: WorkspaceTreeEntry['status']
}) {
  if (additions <= 0 && deletions <= 0 && (!status || status === 'modified')) {
    return null
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums" style={fileTreeStatStyle}>
      {additions > 0 ? <span className="text-emerald-500">+{additions}</span> : null}
      {deletions > 0 ? <span className="text-rose-500">-{deletions}</span> : null}
      {status && status !== 'modified' ? (
        <span
          className={cn(
            'min-w-3 text-center uppercase',
            status === 'added' && 'text-emerald-500',
            status === 'deleted' && 'text-rose-500',
          )}
        >
          {status[0]}
        </span>
      ) : null}
    </span>
  )
}

function fileNameFromPath(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

function directoryFromPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

function entryTotals(entries: WorkspaceTreeEntry[]) {
  return entries.reduce(
    (totals, entry) => ({
      additions: totals.additions + (entry.additions ?? 0),
      deletions: totals.deletions + (entry.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  )
}

export function WorkspaceFileList({
  emptyText = 'No files.',
  entries,
  headerIcon: HeaderIcon = IconFolderCode,
  headerLabel,
  onSelect,
  selectedPath,
  showStats = false,
}: {
  emptyText?: string
  entries: WorkspaceTreeEntry[]
  headerIcon?: ComponentType<{ className?: string }>
  headerLabel: string
  onSelect: (path: string) => void
  selectedPath: string
  showStats?: boolean
}) {
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.path.localeCompare(b.path)),
    [entries],
  )
  const totals = useMemo(() => entryTotals(entries), [entries])

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      data-testid="workspace-file-list"
    >
      <div
        className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/25 px-2"
        style={fileListHeaderStyle}
      >
        <HeaderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium text-foreground">{headerLabel}</span>
        {showStats && (totals.additions > 0 || totals.deletions > 0) ? (
          <span
            className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums"
            style={fileTreeStatStyle}
          >
            <span className="text-emerald-500">+{totals.additions}</span>
            <span className="text-red-400">-{totals.deletions}</span>
          </span>
        ) : null}
      </div>

      <div
        aria-label={headerLabel}
        className="min-h-0 min-w-0 flex-1 overflow-auto py-1"
        role="listbox"
      >
        {sortedEntries.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground" style={typographyStyle('workbench.fileRow')}>
            {emptyText}
          </p>
        ) : (
          sortedEntries.map((entry) => {
            const isSelected = entry.path === selectedPath
            const directory = directoryFromPath(entry.path)

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  'flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-none px-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground',
                  isSelected && 'bg-muted/70 text-foreground',
                )}
                key={entry.path}
                onClick={() => onSelect(entry.path)}
                role="option"
                style={{
                  ...fileListRowStyle,
                  fontWeight: isSelected
                    ? fileListRowRole.selectedFontWeight
                    : fileListRowRole.fontWeight,
                }}
                type="button"
              >
                <IconFile className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span
                    className={cn(
                      entry.status === 'deleted' &&
                        'text-muted-foreground line-through decoration-rose-400/80',
                    )}
                  >
                    {fileNameFromPath(entry.path)}
                  </span>
                  {directory ? (
                    <span className="ml-1.5 text-muted-foreground/70" style={fileListMetaStyle}>
                      {directory}
                    </span>
                  ) : null}
                </span>
                {showStats ? (
                  <RowStats
                    additions={entry.additions ?? 0}
                    deletions={entry.deletions ?? 0}
                    status={entry.status}
                  />
                ) : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export function WorkspaceFileTree({
  emptyText = 'No files.',
  entries,
  headerIcon: HeaderIcon = IconFolderCode,
  headerLabel,
  onSelect,
  rootName,
  searchable = false,
  selectedPath,
  showStats = false,
}: {
  emptyText?: string
  entries: WorkspaceTreeEntry[]
  headerIcon?: ComponentType<{ className?: string }>
  headerLabel: string
  onSelect: (path: string) => void
  rootName: string
  searchable?: boolean
  selectedPath: string
  showStats?: boolean
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const { ref: sizeRef, size } = useContainerSize()

  const tree = useMemo(() => buildTree(rootName, entries), [entries, rootName])
  const arborNodes = useMemo(() => toArborNodes(tree), [tree])
  const initialOpenState = useMemo(() => {
    const folderIds: string[] = []
    collectFolderIds(arborNodes, folderIds)
    if (folderIds.length > EXPAND_ALL_FOLDER_LIMIT) {
      return {}
    }
    return Object.fromEntries(folderIds.map((id) => [id, true]))
  }, [arborNodes])

  const handleSelect = useCallback(
    (node: ArborNode) => {
      if (node.children === null) {
        onSelect(node.id)
      }
    },
    [onSelect],
  )

  function renderNode({ node, style, dragHandle }: NodeRendererProps<ArborNode>) {
    const data = node.data
    const isFolder = data.children !== null
    const isSelected = !isFolder && data.id === selectedPath

    return (
      <div
        ref={dragHandle}
        aria-expanded={isFolder ? node.isOpen : undefined}
        aria-selected={isSelected}
        className={cn(
          'flex h-full w-full min-w-0 cursor-pointer items-center gap-1 rounded-none px-1.5 text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground',
          isSelected && 'bg-muted/70 text-foreground',
        )}
        onClick={(event) => {
          event.stopPropagation()
          if (isFolder) {
            node.toggle()
            return
          }
          handleSelect(data)
        }}
        role="treeitem"
        style={style}
        tabIndex={-1}
      >
        {isFolder ? (
          <IconChevronRight
            aria-hidden="true"
            className={cn('size-3 shrink-0 transition-transform', node.isOpen && 'rotate-90')}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {isFolder ? (
          node.isOpen ? (
            <IconFolderOpen className="size-3 shrink-0" />
          ) : (
            <IconFolder className="size-3 shrink-0" />
          )
        ) : (
          <IconFile className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            data.entry?.status === 'deleted' &&
              'text-muted-foreground line-through decoration-rose-400/80',
          )}
        >
          {data.name}
        </span>
        {showStats ? (
          <RowStats
            additions={data.additions}
            deletions={data.deletions}
            status={isFolder ? undefined : data.entry?.status}
          />
        ) : null}
      </div>
    )
  }

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

      {searchable ? (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/25 px-2">
          <IconSearch className="size-3 shrink-0 text-muted-foreground" />
          <input
            className="h-5 min-w-0 flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearchTerm('')
              }
            }}
            placeholder="Search files"
            type="text"
            value={searchTerm}
          />
          {searchTerm ? (
            <button
              aria-label="Clear search"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchTerm('')}
              type="button"
            >
              <IconX className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 text-[11px] leading-tight" ref={sizeRef}>
        {entries.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-muted-foreground">{emptyText}</p>
        ) : size.height > 0 ? (
          <Tree<ArborNode>
            childrenAccessor={(node) => node.children}
            className="[scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
            data={arborNodes}
            disableDrag
            disableDrop
            disableMultiSelection
            height={size.height}
            idAccessor="id"
            indent={ROW_INDENT_PX}
            initialOpenState={initialOpenState}
            onActivate={(node) => handleSelect(node.data)}
            openByDefault={false}
            renderRow={CompactRow}
            rowHeight={ROW_HEIGHT_PX}
            searchMatch={(node, term) => {
              const needle = term.toLowerCase()
              return (
                node.data.name.toLowerCase().includes(needle) ||
                node.data.id.toLowerCase().includes(needle)
              )
            }}
            searchTerm={searchTerm || undefined}
            width={size.width}
          >
            {renderNode}
          </Tree>
        ) : null}
      </div>
    </div>
  )
}

function useContainerSize() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ height: 0, width: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ height: entry.contentRect.height, width: entry.contentRect.width })
      }
    })
    observer.observe(element)
    setSize({ height: element.clientHeight, width: element.clientWidth })

    return () => observer.disconnect()
  }, [])

  return { ref, size }
}
