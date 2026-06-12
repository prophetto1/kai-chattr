import { chattrJson } from '@/lib/chattr-api'

export type WorkspaceChange = {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
}

export type WorkspaceTree = {
  root: string
  files: string[]
  truncated: boolean
}

export type WorkspaceChanges = {
  root: string
  changes: WorkspaceChange[]
}

export type WorkspaceFilePayload = {
  path: string
  content: string
}

export type WorkspaceDiff = {
  path: string
  original: string
  modified: string
  status: 'added' | 'modified' | 'deleted' | string
}

export type WorkspaceDiffLine = {
  kind: 'context' | 'add' | 'delete'
  oldLine: number | null
  newLine: number | null
  content: string
}

export type WorkspaceDiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  section?: string | null
  lines: WorkspaceDiffLine[]
}

export type WorkspaceDiffFile = WorkspaceChange & {
  binary: boolean
  tooLarge: boolean
  hunks: WorkspaceDiffHunk[]
}

export type WorkspaceDiffDocument = {
  root: string
  baseRef: string
  compareRef: string
  contextLines: number
  interHunkContext: number
  files: WorkspaceDiffFile[]
}

export function getWorkspaceTree() {
  return chattrJson<WorkspaceTree>('/api/workspace/tree')
}

export function getWorkspaceChanges() {
  return chattrJson<WorkspaceChanges>('/api/workspace/changes')
}

export function getWorkspaceFile(path: string) {
  return chattrJson<WorkspaceFilePayload>(
    `/api/workspace/file?path=${encodeURIComponent(path)}`
  )
}

export function getWorkspaceDiff(path: string) {
  return chattrJson<WorkspaceDiff>(`/api/workspace/diff?path=${encodeURIComponent(path)}`)
}

export function getWorkspaceDiffDocument({
  context = 3,
  interHunkContext = 0,
}: {
  context?: number
  interHunkContext?: number
} = {}) {
  const params = new URLSearchParams({
    context: String(context),
    interHunkContext: String(interHunkContext),
  })
  return chattrJson<WorkspaceDiffDocument>(`/api/workspace/diff-document?${params}`)
}

export function saveWorkspaceFile(path: string, content: string) {
  return chattrJson<{ ok: boolean; path: string }>('/api/workspace/file', {
    body: JSON.stringify({ content, path }),
    method: 'PUT',
  })
}

const MONACO_LANGUAGES: Record<string, string> = {
  css: 'css',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  py: 'python',
  sh: 'shell',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  yaml: 'yaml',
  yml: 'yaml',
}

export function monacoLanguageForPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return MONACO_LANGUAGES[extension] ?? 'plaintext'
}
