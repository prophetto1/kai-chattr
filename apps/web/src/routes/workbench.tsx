'use client'

/*
 * JWC Workbench - runtime-connected shell slice.
 *
 * Full-bleed 3-pane IDE shell: slim header, left rail, center chat, and right
 * dock. UI controls are composed from shadcn/ui primitives and Vercel AI
 * Elements rather than local lookalikes. The center chat uses kai-chattr's
 * WebSocket runtime; secondary dock content remains fixture-backed until each
 * slice is migrated.
 */

import { type ComponentType, useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { DiffEditor, Editor } from '@monaco-editor/react'
import {
  IconActivityHeartbeat,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBriefcase,
  IconCheck,
  IconCode,
  IconExternalLink,
  IconFileText,
  IconGitCompare,
  IconLayoutKanban,
  IconRefresh,
  IconTerminal2,
  IconWorld,
  IconWorldSearch,
} from '@tabler/icons-react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
  type AttachmentData,
} from '@/components/ai-elements/attachments'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from '@/components/ai-elements/file-tree'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { SpeechInput } from '@/components/ai-elements/speech-input'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from '@/components/ai-elements/web-preview'
import { BoardDock } from '@/components/workbench/BoardDock'
import { DockWorkspace } from '@/components/workbench/DockWorkspace'
import { JobsDock } from '@/components/workbench/JobsDock'
import { WorkbenchCompactRail } from '@/components/workbench/WorkbenchCompactRail'
import { AgentTerminalPane } from '@/components/workbench/AgentTerminalPane'
import { AgentLauncherDialog } from '@/components/workbench/launcher/AgentLauncherDialog'
import { AppShell } from '@/components/layout/AppShell'
import { Sheet } from '@/components/layout/Sheet'
import { type ChattrRoomMessage, useChattrRoom } from '@/hooks/use-chattr-room'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMonacoTheme } from '@/hooks/use-monaco-theme'
import {
  getObservabilityStatus,
  type ObservabilityStatus,
} from '@/lib/observability-api'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type WorkbenchMessage = {
  id?: number | string
  role: 'assistant' | 'user'
  sender?: string
  text: string
  reasoning?: string
  sources?: Array<{ title: string; href: string }>
  tool?: {
    name: string
    input: Record<string, unknown>
    output: Record<string, unknown>
  }
}

const CHAT_CHANNEL = 'general'

const composerModels = [
  {
    chef: 'OpenAI',
    chefSlug: 'openai',
    id: 'gpt-4o',
    name: 'GPT-4o',
    providers: ['openai', 'azure'],
  },
  {
    chef: 'OpenAI',
    chefSlug: 'openai',
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    providers: ['openai', 'azure'],
  },
  {
    chef: 'Anthropic',
    chefSlug: 'anthropic',
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    providers: ['anthropic', 'google', 'amazon-bedrock'],
  },
  {
    chef: 'Google',
    chefSlug: 'google',
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    providers: ['google'],
  },
] as const

const defaultExpandedDockPaths = new Set([
  'src',
  'src/app',
  'src/app/(frontend)',
  'src/components',
  'src/components/ai-elements',
  'src/components/ui',
])

const defaultExpandedDocsPaths = new Set([
  'apps',
  'apps/internal',
  'apps/internal/content',
  'apps/internal/content/jwc-features',
  'apps/internal/content/projects',
  'apps/internal/content/projects/chattr',
  'apps/internal/content/projects/chattr/contracts',
  'apps/internal/content/storage-repos',
  'apps/internal/content/storage-repos/implementation-tracker',
])

const defaultExpandedChangesPaths = new Set([
  'changes:kai-chattr',
  'changes:apps',
  'changes:apps/web',
  'changes:apps/web/src',
  'changes:apps/web/src/routes',
  'changes:apps/web/src/components',
  'changes:apps/web/src/components/ai-elements',
  'changes:apps/web/src/components/workbench',
  'changes:apps/devdocs',
  'changes:apps/devdocs/content',
  'changes:apps/devdocs/content/implementation',
  'changes:apps/devdocs/content/implementation/frontend',
  'changes:docs',
  'changes:docs/images',
])

type DockTabId =
  | 'board'
  | 'jobs'
  | 'changes'
  | 'browser'
  | 'code'
  | 'docs'
  | 'observability'
  | 'terminal'
type WorkbenchIcon = ComponentType<{
  size?: number | string
  stroke?: number
  className?: string
}>

const dockTabs: Array<{
  id: DockTabId
  label: string
  icon: WorkbenchIcon
}> = [
  { id: 'board', label: 'Board', icon: IconLayoutKanban },
  { id: 'jobs', label: 'Jobs', icon: IconBriefcase },
  { id: 'changes', label: 'Changes', icon: IconGitCompare },
  { id: 'browser', label: 'Browser', icon: IconWorld },
  { id: 'code', label: 'Code', icon: IconCode },
  { id: 'docs', label: 'Docs', icon: IconBook },
  { id: 'observability', label: 'Observability', icon: IconActivityHeartbeat },
  { id: 'terminal', label: 'Terminal', icon: IconTerminal2 },
]

const browserLogs = [
  {
    level: 'log' as const,
    message: 'Connected to jwc-global dev server on :1717',
    timestamp: new Date('2026-06-05T14:12:00Z'),
  },
  {
    level: 'warn' as const,
    message: 'Preview uses the local docs URL until browser automation is wired.',
    timestamp: new Date('2026-06-05T14:12:03Z'),
  },
]

const codePaneSource = `export default function WorkbenchPage() {
  return (
    <Tabs value={activeDockTab} onValueChange={handleDockTabChange}>
      <WorkbenchChatPane />
      <WorkbenchDock />
    </Tabs>
  )
}`

const changesOriginalSource = `function SourceViewerPane({ selectedPath, filename, language, code }) {
  return (
    <ResizablePanelGroup direction="horizontal">
      <WorkbenchRepositoryTree selectedPath={selectedPath} />
      <CodeBlock code={code} language={language} />
    </ResizablePanelGroup>
  )
}`

const changesModifiedSource = `function SourceViewerPane({ selectedPath, filename, language, code }) {
  return (
    <DockWorkspace
      title={filename}
      path={selectedPath}
      showSidebarLabel={false}
      sidebarDefaultSize="30%"
      sidebar={<WorkbenchRepositoryTree selectedPath={selectedPath} />}
      main={<MonacoEditor path={selectedPath} value={code} />}
    />
  )
}`

type WorkbenchChangeItem = {
  path: string
  name: string
  additions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted'
  language: 'typescript' | 'markdown' | 'plaintext'
  original: string
  modified: string
}

const workbenchChangeItems: WorkbenchChangeItem[] = [
  {
    path: 'apps/web/src/routes/workbench.tsx',
    name: 'workbench.tsx',
    additions: 128,
    deletions: 36,
    status: 'modified',
    language: 'typescript',
    original: changesOriginalSource,
    modified: changesModifiedSource,
  },
  {
    path: 'apps/web/src/components/ai-elements/file-tree.tsx',
    name: 'file-tree.tsx',
    additions: 51,
    deletions: 14,
    status: 'modified',
    language: 'typescript',
    original: `export const FileTreeFile = ({ path, name }) => {
  return (
    <div className="flex h-[22px] items-center gap-1.5 rounded-[3px] px-1">
      <IconFile className="size-3.5" />
      <FileTreeName>{name}</FileTreeName>
    </div>
  )
}`,
    modified: `export const FileTreeFile = ({
  path,
  name,
  status,
  additions,
  deletions,
}) => {
  return (
    <div className="flex h-5 items-center gap-1 rounded-none px-1.5">
      <IconFile className="size-3" />
      <FileTreeName className={status === 'deleted' ? 'line-through' : undefined}>
        {name}
      </FileTreeName>
      <FileTreeStats additions={additions} deletions={deletions} status={status} />
    </div>
  )
}`,
  },
  {
    path: 'apps/web/src/components/workbench/DockWorkspace.tsx',
    name: 'DockWorkspace.tsx',
    additions: 18,
    deletions: 6,
    status: 'modified',
    language: 'typescript',
    original: `function DockWorkspace({ title, sidebarLabel = 'Files', sidebar, main }) {
  return (
    <ResizablePanel defaultSize="32%" minSize="22%">
      <div className="h-7 px-2 uppercase">{sidebarLabel}</div>
      {sidebar}
    </ResizablePanel>
  )
}`,
    modified: `function DockWorkspace({
  title,
  sidebar,
  main,
  sidebarDefaultSize = '32%',
  sidebarMinSize = '22%',
  showSidebarLabel = true,
}) {
  return (
    <ResizablePanel defaultSize={sidebarDefaultSize} minSize={sidebarMinSize}>
      {showSidebarLabel ? <div className="h-7 px-2 uppercase">Files</div> : null}
      {sidebar}
    </ResizablePanel>
  )
}`,
  },
  {
    path: 'apps/devdocs/content/implementation/frontend/closure-conformance-workflow.mdx',
    name: 'closure-conformance-workflow.mdx',
    additions: 0,
    deletions: 18,
    status: 'deleted',
    language: 'markdown',
    original: `# Closure Conformance Workflow

This page belonged to the previous devdocs scaffold and is shown here as a
deleted workbench artifact in the current working-tree preview.`,
    modified: '',
  },
  {
    path: 'docs/images/current-ours.png',
    name: 'current-ours.png',
    additions: 16,
    deletions: 0,
    status: 'added',
    language: 'plaintext',
    original: '',
    modified: `Binary visual checkpoint added for comparison.

The Changes pane shows image artifacts in the changed-file navigator and keeps
the main editor area focused on text diffs when a source file is selected.`,
  },
]

const workbenchChangeTotals = workbenchChangeItems.reduce(
  (totals, change) => ({
    additions: totals.additions + change.additions,
    deletions: totals.deletions + change.deletions,
  }),
  { additions: 0, deletions: 0 }
)

const docsPaneSource = `# Workbench Surface

- Chat composer uses AI Elements PromptInput.
- Right dock tabs are shadcn Tabs in the shell header.
- Docs tab owns the secondary docs file tree, not the primary app sidebar.
- Code and document panes reserve the Monaco and Tiptap slots.
- Terminal renders the read-only agent snapshot stream from /api/terminal.`

const dockContentClassName =
  'm-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=inactive]:hidden'
const dockWorkspaceContentClassName = `${dockContentClassName} bg-card`

const composerModelGroups = Array.from(new Set(composerModels.map((model) => model.chef)))

function ComposerAttachmentItem({
  attachment,
  onRemove,
}: {
  attachment: AttachmentData
  onRemove: (id: string) => void
}) {
  const handleRemove = useCallback(() => {
    onRemove(attachment.id)
  }, [attachment.id, onRemove])

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  )
}

function ComposerAttachmentsDisplay() {
  const attachments = usePromptInputAttachments()

  const handleRemove = useCallback(
    (id: string) => {
      attachments.remove(id)
    },
    [attachments]
  )

  if (attachments.files.length === 0) {
    return null
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <ComposerAttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  )
}

function WorkbenchRepositoryTree({ selectedPath }: { selectedPath: string }) {
  return (
    <FileTree
      className="h-full rounded-none border-0 bg-transparent"
      defaultExpanded={defaultExpandedDockPaths}
      selectedPath={selectedPath}
    >
      <FileTreeFolder name="src" path="src">
        <FileTreeFolder name="app" path="src/app">
          <FileTreeFolder name="(frontend)" path="src/app/(frontend)">
            <FileTreeFile
              name="workbench.tsx"
              path="apps/web/src/routes/workbench.tsx"
            />
            <FileTreeFile
              name="[[...slug]]/page.tsx"
              path="src/app/(frontend)/[[...slug]]/page.tsx"
            />
          </FileTreeFolder>
        </FileTreeFolder>
        <FileTreeFolder name="components" path="src/components">
          <FileTreeFolder name="ai-elements" path="src/components/ai-elements">
            <FileTreeFile name="file-tree.tsx" path="src/components/ai-elements/file-tree.tsx" />
            <FileTreeFile name="terminal.tsx" path="src/components/ai-elements/terminal.tsx" />
            <FileTreeFile name="web-preview.tsx" path="src/components/ai-elements/web-preview.tsx" />
            <FileTreeFile name="prompt-input.tsx" path="src/components/ai-elements/prompt-input.tsx" />
          </FileTreeFolder>
          <FileTreeFolder name="ui" path="src/components/ui">
            <FileTreeFile name="dialog.tsx" path="src/components/ui/dialog.tsx" />
            <FileTreeFile name="resizable.tsx" path="src/components/ui/resizable.tsx" />
            <FileTreeFile name="sidebar.tsx" path="src/components/ui/sidebar.tsx" />
            <FileTreeFile name="tabs.tsx" path="src/components/ui/tabs.tsx" />
          </FileTreeFolder>
        </FileTreeFolder>
      </FileTreeFolder>
      <FileTreeFolder name="apps" path="apps">
        <FileTreeFolder name="internal" path="apps/internal">
          <FileTreeFolder name="content" path="apps/internal/content">
            <FileTreeFile
              name="jwc-features/meta.json"
              path="apps/internal/content/jwc-features/meta.json"
            />
          </FileTreeFolder>
        </FileTreeFolder>
      </FileTreeFolder>
    </FileTree>
  )
}

function ChangeCounts({
  additions,
  deletions,
  className,
}: {
  additions: number
  deletions: number
  className?: string
}) {
  return (
    <div
      className={`ml-auto flex shrink-0 items-center gap-1.5 text-[11px] leading-none tabular-nums ${className ?? ''}`}
    >
      {additions > 0 ? <span className="text-emerald-500">+{additions}</span> : null}
      {deletions > 0 ? <span className="text-rose-500">-{deletions}</span> : null}
    </div>
  )
}

function WorkbenchChangesTree({
  selectedPath,
  onSelect,
  showStats = true,
}: {
  selectedPath: string
  onSelect: (path: string) => void
  showStats?: boolean
}) {
  const handleSelect = useCallback(
    (path: string) => {
      if (workbenchChangeItems.some((change) => change.path === path)) {
        onSelect(path)
      }
    },
    [onSelect]
  )

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      data-testid="changes-tree"
    >
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/25 px-2 text-[11px]">
        <IconGitCompare className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate font-medium text-foreground">All changes</span>
        {showStats ? (
          <ChangeCounts
            additions={workbenchChangeTotals.additions}
            deletions={workbenchChangeTotals.deletions}
          />
        ) : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <FileTree
          className="min-h-full max-w-full rounded-none border-0 bg-transparent"
          defaultExpanded={defaultExpandedChangesPaths}
          density="compact"
          onSelect={handleSelect}
          selectedPath={selectedPath}
          showGuides={false}
          showStats={showStats}
        >
          <FileTreeFolder
            additions={workbenchChangeTotals.additions}
            deletions={workbenchChangeTotals.deletions}
            name="kai-chattr"
            path="changes:kai-chattr"
          >
            <FileTreeFolder additions={197} deletions={74} name="apps" path="changes:apps">
              <FileTreeFolder additions={197} deletions={56} name="web" path="changes:apps/web">
                <FileTreeFolder additions={197} deletions={56} name="src" path="changes:apps/web/src">
                  <FileTreeFolder
                    additions={128}
                    deletions={36}
                    name="routes"
                    path="changes:apps/web/src/routes"
                  >
                    <FileTreeFile
                      additions={128}
                      deletions={36}
                      name="workbench.tsx"
                      path="apps/web/src/routes/workbench.tsx"
                      status="modified"
                    />
                  </FileTreeFolder>
                  <FileTreeFolder
                    additions={69}
                    deletions={20}
                    name="components"
                    path="changes:apps/web/src/components"
                  >
                    <FileTreeFolder
                      additions={51}
                      deletions={14}
                      name="ai-elements"
                      path="changes:apps/web/src/components/ai-elements"
                    >
                      <FileTreeFile
                        additions={51}
                        deletions={14}
                        name="file-tree.tsx"
                        path="apps/web/src/components/ai-elements/file-tree.tsx"
                        status="modified"
                      />
                    </FileTreeFolder>
                    <FileTreeFolder
                      additions={18}
                      deletions={6}
                      name="workbench"
                      path="changes:apps/web/src/components/workbench"
                    >
                      <FileTreeFile
                        additions={18}
                        deletions={6}
                        name="DockWorkspace.tsx"
                        path="apps/web/src/components/workbench/DockWorkspace.tsx"
                        status="modified"
                      />
                    </FileTreeFolder>
                  </FileTreeFolder>
                </FileTreeFolder>
              </FileTreeFolder>
              <FileTreeFolder additions={0} deletions={18} name="devdocs" path="changes:apps/devdocs">
                <FileTreeFolder
                  additions={0}
                  deletions={18}
                  name="content"
                  path="changes:apps/devdocs/content"
                >
                  <FileTreeFolder
                    additions={0}
                    deletions={18}
                    name="implementation"
                    path="changes:apps/devdocs/content/implementation"
                  >
                    <FileTreeFolder
                      additions={0}
                      deletions={18}
                      name="frontend"
                      path="changes:apps/devdocs/content/implementation/frontend"
                    >
                      <FileTreeFile
                        deletions={18}
                        icon={<IconFileText className="size-3 text-muted-foreground" />}
                        name="closure-conformance-workflow.mdx"
                        path="apps/devdocs/content/implementation/frontend/closure-conformance-workflow.mdx"
                        status="deleted"
                      />
                    </FileTreeFolder>
                  </FileTreeFolder>
                </FileTreeFolder>
              </FileTreeFolder>
            </FileTreeFolder>
            <FileTreeFolder additions={16} deletions={0} name="docs" path="changes:docs">
              <FileTreeFolder additions={16} deletions={0} name="images" path="changes:docs/images">
                <FileTreeFile
                  additions={16}
                  name="current-ours.png"
                  path="docs/images/current-ours.png"
                  status="added"
                />
              </FileTreeFolder>
            </FileTreeFolder>
          </FileTreeFolder>
        </FileTree>
      </div>
    </div>
  )
}

function WorkbenchDocsTree({ selectedPath }: { selectedPath: string }) {
  return (
    <FileTree
      className="h-full rounded-none border-0 bg-transparent"
      defaultExpanded={defaultExpandedDocsPaths}
      selectedPath={selectedPath}
    >
      <FileTreeFolder name="apps" path="apps">
        <FileTreeFolder name="internal" path="apps/internal">
          <FileTreeFolder name="content" path="apps/internal/content">
            <FileTreeFolder name="jwc-features" path="apps/internal/content/jwc-features">
              <FileTreeFile
                name="index.mdx"
                path="apps/internal/content/jwc-features/index.mdx"
              />
              <FileTreeFile
                name="meta.json"
                path="apps/internal/content/jwc-features/meta.json"
              />
              <FileTreeFolder
                name="implementation-tracker"
                path="apps/internal/content/jwc-features/implementation-tracker"
              >
                <FileTreeFile
                  name="index.mdx"
                  path="apps/internal/content/jwc-features/implementation-tracker/index.mdx"
                />
              </FileTreeFolder>
            </FileTreeFolder>
            <FileTreeFolder name="projects" path="apps/internal/content/projects">
              <FileTreeFolder name="chattr" path="apps/internal/content/projects/chattr">
                <FileTreeFile
                  name="index.mdx"
                  path="apps/internal/content/projects/chattr/index.mdx"
                />
                <FileTreeFile
                  name="governance.mdx"
                  path="apps/internal/content/projects/chattr/governance.mdx"
                />
                <FileTreeFolder
                  name="contracts"
                  path="apps/internal/content/projects/chattr/contracts"
                >
                  <FileTreeFile
                    name="frontend.mdx"
                    path="apps/internal/content/projects/chattr/contracts/frontend.mdx"
                  />
                  <FileTreeFile
                    name="backend.mdx"
                    path="apps/internal/content/projects/chattr/contracts/backend.mdx"
                  />
                  <FileTreeFile
                    name="architecture.mdx"
                    path="apps/internal/content/projects/chattr/contracts/architecture.mdx"
                  />
                </FileTreeFolder>
              </FileTreeFolder>
              <FileTreeFolder name="blockdata" path="apps/internal/content/projects/blockdata">
                <FileTreeFile
                  name="index.mdx"
                  path="apps/internal/content/projects/blockdata/index.mdx"
                />
                <FileTreeFolder
                  name="contracts"
                  path="apps/internal/content/projects/blockdata/contracts"
                >
                  <FileTreeFile
                    name="frontend.mdx"
                    path="apps/internal/content/projects/blockdata/contracts/frontend.mdx"
                  />
                  <FileTreeFile
                    name="backend.mdx"
                    path="apps/internal/content/projects/blockdata/contracts/backend.mdx"
                  />
                  <FileTreeFile
                    name="architecture.mdx"
                    path="apps/internal/content/projects/blockdata/contracts/architecture.mdx"
                  />
                </FileTreeFolder>
              </FileTreeFolder>
            </FileTreeFolder>
            <FileTreeFolder name="research" path="apps/internal/content/research">
              <FileTreeFile name="index.mdx" path="apps/internal/content/research/index.mdx" />
              <FileTreeFolder name="papers" path="apps/internal/content/research/papers">
                <FileTreeFile name="index.mdx" path="apps/internal/content/research/papers/index.mdx" />
              </FileTreeFolder>
            </FileTreeFolder>
            <FileTreeFolder name="storage-repos" path="apps/internal/content/storage-repos">
              <FileTreeFolder
                name="implementation-tracker"
                path="apps/internal/content/storage-repos/implementation-tracker"
              >
                <FileTreeFile
                  name="progress.mdx"
                  path="apps/internal/content/storage-repos/implementation-tracker/progress.mdx"
                />
                <FileTreeFolder
                  name="497e8bc7-workbench-migration"
                  path="apps/internal/content/storage-repos/implementation-tracker/497e8bc7-workbench-migration"
                >
                  <FileTreeFile
                    name="plan-r2.mdx"
                    path="apps/internal/content/storage-repos/implementation-tracker/497e8bc7-workbench-migration/plan-r2.mdx"
                  />
                  <FileTreeFile
                    name="evidence-r1.mdx"
                    path="apps/internal/content/storage-repos/implementation-tracker/497e8bc7-workbench-migration/evidence-r1.mdx"
                  />
                </FileTreeFolder>
              </FileTreeFolder>
            </FileTreeFolder>
          </FileTreeFolder>
        </FileTreeFolder>
      </FileTreeFolder>
    </FileTree>
  )
}

function SourceViewerPane({
  selectedPath,
  title,
  language,
  code,
  icon,
  onClose,
}: {
  selectedPath: string
  title: string
  language: 'tsx' | 'markdown'
  code: string
  icon: WorkbenchIcon
  onClose?: () => void
}) {
  const monacoTheme = useMonacoTheme()
  const [treeSelected, setTreeSelected] = useState(selectedPath)

  return (
    <DockWorkspace
      title={title}
      path={selectedPath}
      icon={icon}
      onClose={onClose}
      sidebar={
        <WorkbenchChangesTree
          onSelect={setTreeSelected}
          selectedPath={treeSelected}
          showStats={false}
        />
      }
      main={
        <Editor
          defaultLanguage={language === 'tsx' ? 'typescript' : 'markdown'}
          theme={monacoTheme}
          options={{
            fontSize: 12,
            lineDecorationsWidth: 12,
            lineNumbersMinChars: 3,
            minimap: { enabled: false },
            padding: { top: 12 },
            readOnly: true,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
          path={selectedPath}
          value={code}
        />
      }
    />
  )
}

function ChangesViewerPane({ onClose }: { onClose?: () => void }) {
  const [selectedPath, setSelectedPath] = useState(workbenchChangeItems[0].path)
  const selectedChange =
    workbenchChangeItems.find((change) => change.path === selectedPath) ??
    workbenchChangeItems[0]
  const monacoTheme = useMonacoTheme()

  return (
    <DockWorkspace
      title="Changes"
      path={selectedPath}
      icon={IconGitCompare}
      onClose={onClose}
      showSidebarLabel={false}
      scrollSidebar={false}
      sidebarClassName="bg-background"
      sidebarDefaultSize="30%"
      sidebarMinSize="20%"
      sidebar={
        <WorkbenchChangesTree
          onSelect={setSelectedPath}
          selectedPath={selectedPath}
        />
      }
      main={
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div
            className="flex h-8 shrink-0 items-center gap-2 border-b border-border/25 bg-muted/15 px-2 text-[11px]"
            data-testid="changes-selected-file"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-foreground">{selectedChange.path}</div>
            </div>
            <ChangeCounts
              additions={selectedChange.additions}
              deletions={selectedChange.deletions}
            />
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              keepCurrentModifiedModel
              keepCurrentOriginalModel
              theme={monacoTheme}
              language={selectedChange.language}
              modified={selectedChange.modified}
              modifiedModelPath={`file:///${selectedChange.path}`}
              original={selectedChange.original}
              originalModelPath={`file:///${selectedChange.path}.base`}
              options={{
                fontSize: 12,
                lineDecorationsWidth: 12,
                lineNumbersMinChars: 3,
                minimap: { enabled: false },
                padding: { top: 12 },
                readOnly: true,
                renderSideBySide: false,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
            />
          </div>
        </div>
      }
    />
  )
}

function BrowserPreviewPane() {
  return (
    <WebPreview
      className="h-full rounded-none border-0 bg-background"
      defaultUrl="http://localhost:1717/workbench"
    >
      <WebPreviewNavigation className="h-9 shrink-0 gap-1 border-b border-border p-1.5">
        <WebPreviewNavigationButton tooltip="Back">
          <IconArrowLeft className="size-4" />
        </WebPreviewNavigationButton>
        <WebPreviewNavigationButton tooltip="Forward">
          <IconArrowRight className="size-4" />
        </WebPreviewNavigationButton>
        <WebPreviewNavigationButton tooltip="Reload">
          <IconRefresh className="size-4" />
        </WebPreviewNavigationButton>
        <WebPreviewUrl className="h-7 text-xs" />
        <WebPreviewNavigationButton tooltip="Open externally">
          <IconExternalLink className="size-4" />
        </WebPreviewNavigationButton>
      </WebPreviewNavigation>
      <WebPreviewBody className="bg-background" />
      <WebPreviewConsole logs={browserLogs} />
    </WebPreview>
  )
}

function toWorkbenchMessage(message: ChattrRoomMessage): WorkbenchMessage {
  return {
    id: message.uid ?? message.id ?? `${message.sender}-${message.timestamp ?? message.text}`,
    role: message.sender === 'user' ? 'user' : 'assistant',
    sender: message.sender,
    text: message.text,
  }
}

function WorkbenchChatMessage({
  index,
  message,
}: {
  index: number
  message: WorkbenchMessage
}) {
  return (
    <Message from={message.role} key={`${message.role}-${index}`}>
      <MessageContent>
        {message.reasoning && (
          <Reasoning className="mb-3" defaultOpen={false} duration={14}>
            <ReasoningTrigger />
            <ReasoningContent>{message.reasoning}</ReasoningContent>
          </Reasoning>
        )}
        <MessageResponse>{message.text}</MessageResponse>
        {message.tool && (
          <Tool className="mt-3" defaultOpen={false}>
            <ToolHeader
              state="output-available"
              title={message.tool.name}
              toolName={message.tool.name}
              type="dynamic-tool"
            />
            <ToolContent>
              <ToolInput input={message.tool.input} />
              <ToolOutput errorText={undefined} output={message.tool.output} />
            </ToolContent>
          </Tool>
        )}
        {message.sources && (
          <Sources className="mt-3">
            <SourcesTrigger count={message.sources.length} />
            <SourcesContent>
              {message.sources.map((source) => (
                <Source href={source.href} key={source.href} title={source.title} />
              ))}
            </SourcesContent>
          </Sources>
        )}
      </MessageContent>
    </Message>
  )
}

function ObservabilityStatusChip({
  compact = false,
  isError,
  isLoading,
  status,
}: {
  compact?: boolean
  isError: boolean
  isLoading: boolean
  status?: ObservabilityStatus
}) {
  const exporter =
    status?.otel_traces_exporter?.trim() ||
    (isError ? 'unavailable' : isLoading ? 'loading' : 'unknown')
  const serviceName = status?.otel_service_name?.trim() || status?.service_name?.trim() || 'kai-chattr-api'
  const endpoint = status?.otel_exporter_otlp_endpoint?.trim()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={`otel_traces_exporter ${exporter}`}
          aria-live="polite"
          className={cn(
            compact
              ? 'flex size-9 shrink-0 items-center justify-center rounded-[5px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              : 'flex h-7 w-full min-w-0 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-2.5 text-[11px] text-muted-foreground'
          )}
          data-testid="otel-traces-exporter"
        >
          <IconActivityHeartbeat aria-hidden="true" className="size-3.5 shrink-0 text-emerald-500" />
          {compact ? (
            <span className="sr-only">otel_traces_exporter {exporter}</span>
          ) : (
            <>
              <span className="shrink-0 font-medium text-foreground">otel_traces_exporter</span>
              <span className="min-w-0 truncate rounded-sm bg-background/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {exporter}
              </span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side={compact ? 'right' : 'bottom'}>
        <div className="grid gap-1 text-xs">
          <span>Service: {serviceName}</span>
          <span>Exporter: {exporter}</span>
          {endpoint ? <span>Endpoint: {endpoint}</span> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function ObservabilityDockPanel({
  isError,
  isLoading,
  status,
}: {
  isError: boolean
  isLoading: boolean
  status?: ObservabilityStatus
}) {
  const exporter =
    status?.otel_traces_exporter?.trim() ||
    (isError ? 'unavailable' : isLoading ? 'loading' : 'unknown')
  const serviceName = status?.otel_service_name?.trim() || status?.service_name?.trim() || 'kai-chattr-api'
  const endpoint = status?.otel_exporter_otlp_endpoint?.trim()
  const jaegerUrl = status?.otel_jaeger_ui_url?.trim() || 'http://127.0.0.1:8886'
  const logfireLabel = status?.logfire_configured
    ? 'Configured'
    : status?.logfire_enabled
      ? 'Token missing'
      : 'SOPS-gated'
  const statusLabel = status?.status === 'active'
    ? 'Running'
    : isError
      ? 'Unavailable'
      : isLoading
        ? 'Loading'
        : 'Unknown'
  const statusTone = status?.status === 'active' ? 'default' : 'outline'

  return (
    <div className="h-full overflow-auto bg-background p-3" data-testid="observability-dock-panel">
      <div className="grid gap-4">
        <div className="rounded-md border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold tracking-normal text-foreground">Runtime telemetry</h2>
                <Badge variant={statusTone}>{statusLabel}</Badge>
                <Badge variant="outline">{exporter}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {'Collector -> Jaeger + Logfire. Service '}
                {serviceName}
                {endpoint ? ` -> ${endpoint}` : ' -> OTLP endpoint not configured'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <TelemetryMetric label="Service" value={serviceName} />
            <TelemetryMetric label="otel_traces_exporter" value={exporter} />
            <TelemetryMetric label="OTLP endpoint" value={endpoint || 'Not configured'} />
            <TelemetryMetric label="Jaeger UI" value={jaegerUrl} />
            <TelemetryMetric label="Logfire" value={logfireLabel} />
          </div>
        </div>

        <div className="rounded-md border bg-background">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold tracking-normal text-foreground">Recent backend spans</h2>
          </div>
          <div className="px-4 py-8 text-sm text-muted-foreground">
            Trace listing is reserved for the collector reader surface. Current exporter: {exporter}.
          </div>
        </div>
      </div>
    </div>
  )
}

function TelemetryMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{props.value}</div>
    </div>
  )
}

export default function WorkbenchPage() {
  const navigate = useNavigate()
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null)
  const rightDockRef = useRef<PanelImperativeHandle | null>(null)
  const isMobile = useIsMobile()
  const [activeDockTab, setActiveDockTab] = useState<DockTabId>('board')
  const [mobileDockOpen, setMobileDockOpen] = useState(false)
  const { messages: roomMessages, sendMessage } = useChattrRoom({ channel: CHAT_CHANNEL })
  const chatMessages = useMemo(
    () => roomMessages.map(toWorkbenchMessage),
    [roomMessages]
  )
  const [composerText, setComposerText] = useState('')
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<(typeof composerModels)[number]['id']>(
    composerModels[0].id
  )
  const selectedModelData = useMemo(
    () => composerModels.find((model) => model.id === selectedModel) ?? composerModels[0],
    [selectedModel]
  )
  const observabilityStatusQuery = useQuery({
    queryKey: ['observability-status'],
    queryFn: getObservabilityStatus,
    refetchInterval: 15000,
    staleTime: 5000,
  })

  const closeRightDock = useCallback(() => {
    if (isMobile) {
      setMobileDockOpen(false)
      return
    }

    rightDockRef.current?.collapse()
  }, [isMobile])

  const openDockTab = useCallback((tab: DockTabId) => {
    setActiveDockTab(tab)

    const panel = rightDockRef.current
    if (isMobile) {
      setMobileDockOpen(true)
      chatPanelRef.current?.collapse()
      panel?.resize(100)
    } else if (panel?.isCollapsed()) {
      panel.expand()
    }
  }, [isMobile])

  const handleDockTabChange = useCallback((value: string) => {
    openDockTab(value as DockTabId)
  }, [openDockTab])

  const handleDockTabClick = useCallback((tab: DockTabId) => {
    openDockTab(tab)
  }, [openDockTab])

  const handleNewSession = useCallback(() => {
    setComposerText('')
  }, [])

  const handleComposerSubmit = useCallback((message: PromptInputMessage) => {
    const text = message.text.trim()
    const attachmentCount = message.files.length

    if (!text && attachmentCount === 0) {
      return
    }

    const sent = sendMessage({
      attachments: message.files,
      text: text || `Sent ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`,
    })

    if (!sent) {
      throw new Error('Workbench chat WebSocket is not connected')
    }

    setComposerText('')
  }, [sendMessage])

  const handleComposerTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setComposerText(event.currentTarget.value)
    },
    []
  )

  const handleTranscriptionChange = useCallback((transcript: string) => {
    setComposerText((current) => (current ? `${current} ${transcript}` : transcript))
  }, [])

  const toggleWebSearch = useCallback(() => {
    setUseWebSearch((current) => !current)
  }, [])

  const handleModelSelect = useCallback((modelId: (typeof composerModels)[number]['id']) => {
    setSelectedModel(modelId)
    setModelSelectorOpen(false)
  }, [])

  return (
    <TooltipProvider delayDuration={150}>
      <AppShell
        rail={(
          <WorkbenchCompactRail
            account={{
              initials: 'J',
              label: 'Jon',
              secondaryLabel: 'kai-chattr workspace',
              status: 'online',
            }}
            activeItem="conversations"
            defaultExpanded={false}
            onAccount={() => navigate('/settings')}
            onBilling={() => navigate('/settings')}
            onBrand={() => navigate('/home')}
            onNewSession={handleNewSession}
            onNotifications={() => navigate('/settings')}
            onOpenSettings={() => navigate('/settings')}
            utilities={({ expanded }) => (
              <>
                <ObservabilityStatusChip
                  compact={!expanded}
                  isError={observabilityStatusQuery.isError}
                  isLoading={observabilityStatusQuery.isLoading}
                  status={observabilityStatusQuery.data}
                />
                <AgentLauncherDialog compact={!expanded} />
              </>
            )}
          />
        )}
      >
        <Tabs
          className="jwc-workbench-shell flex min-h-0 flex-1 flex-col gap-[5px] overflow-hidden text-[13px] text-foreground antialiased"
          onValueChange={handleDockTabChange}
          value={activeDockTab}
        >
          <Sheet className="h-10 shrink-0">
            <header className="flex h-full shrink-0 items-center gap-2 px-3 text-foreground">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="hidden truncate text-xs font-medium text-foreground sm:inline">
                  Workbench session
                </span>
              </div>
              <div className="ml-auto flex min-w-0 items-center justify-end overflow-hidden">
                <TabsList
                  variant="line"
                  className="h-8 shrink-0 gap-0.5 rounded-none bg-transparent p-0 sm:gap-1"
                >
                  {dockTabs.map((tab) => {
                    const DockIcon = tab.icon

                    return (
                      <TabsTrigger
                        aria-label={tab.label}
                        className="h-8 w-8 flex-none px-0 text-[var(--wb-tab-icon)] data-[state=active]:text-[var(--wb-tab-icon-active)] after:hidden active:scale-95 sm:w-auto sm:px-2.5"
                        key={tab.id}
                        onClick={() => handleDockTabClick(tab.id)}
                        title={tab.label}
                        value={tab.id}
                      >
                        <DockIcon className="size-[18px]" />
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </div>
            </header>
          </Sheet>

          <div className="flex min-h-0 flex-1 overflow-hidden">
              <ResizablePanelGroup
                className="min-h-0 min-w-0 flex-1"
                direction="horizontal"
                key={
                  isMobile
                    ? `mobile-workbench-panels-${mobileDockOpen ? 'dock' : 'chat'}`
                    : 'desktop-workbench-panels'
                }
              >
                <ResizablePanel
                  id="chat"
                  order={1}
                  collapsible={isMobile}
                  collapsedSize={0}
                  defaultSize={isMobile && mobileDockOpen ? 0 : 54}
                  minSize={isMobile ? 0 : 32}
                  panelRef={chatPanelRef}
                >
                  <Sheet className={isMobile && mobileDockOpen ? 'hidden h-full' : 'h-full'}>
                <Conversation className="flex-1">
                  <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6">
                    {chatMessages.map((m, i) => (
                      <WorkbenchChatMessage
                        index={i}
                        key={m.id ?? `${m.role}-${i}`}
                        message={m}
                      />
                    ))}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
                <div className="shrink-0 px-4 pb-4 pt-1.5">
                  <div className="mx-auto grid min-w-0 w-full max-w-3xl gap-2">
                    <PromptInput
                      className="min-w-0 max-w-full [&_[data-slot=input-group]]:rounded-[24px] [&_[data-slot=input-group]]:border-border/70 [&_[data-slot=input-group]]:bg-background [&_[data-slot=input-group]]:shadow-[0_2px_5px_rgba(17,18,24,0.06),0_12px_30px_rgba(17,18,24,0.10)]"
                      globalDrop
                      multiple
                      onSubmit={handleComposerSubmit}
                    >
                      <PromptInputHeader>
                        <ComposerAttachmentsDisplay />
                      </PromptInputHeader>
                      <PromptInputBody>
                        <PromptInputTextarea
                          className="min-h-[58px] px-4 pt-4"
                          onChange={handleComposerTextChange}
                          placeholder="Run task with Claude — type / for commands"
                          value={composerText}
                        />
                      </PromptInputBody>
                      <PromptInputFooter className="flex-wrap px-4 pb-3">
                        <PromptInputTools className="flex-wrap">
                          <PromptInputActionMenu>
                            <PromptInputActionMenuTrigger tooltip="Add context" />
                            <PromptInputActionMenuContent>
                              <PromptInputActionAddAttachments />
                              <PromptInputActionAddScreenshot />
                            </PromptInputActionMenuContent>
                          </PromptInputActionMenu>
                          <SpeechInput
                            className="shrink-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                            onTranscriptionChange={handleTranscriptionChange}
                            size="icon-sm"
                            variant="ghost"
                          />
                          <PromptInputButton
                            onClick={toggleWebSearch}
                            tooltip="Toggle web search"
                            variant={useWebSearch ? 'default' : 'ghost'}
                          >
                            <IconWorldSearch className="size-4" />
                            <span className="hidden sm:inline">Search</span>
                          </PromptInputButton>
                          <ModelSelector
                            onOpenChange={setModelSelectorOpen}
                            open={modelSelectorOpen}
                          >
                            <ModelSelectorTrigger asChild>
                              <PromptInputButton tooltip="Select model">
                                <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                                <ModelSelectorName className="hidden sm:inline">
                                  {selectedModelData.name}
                                </ModelSelectorName>
                              </PromptInputButton>
                            </ModelSelectorTrigger>
                            <ModelSelectorContent>
                              <ModelSelectorInput placeholder="Search models..." />
                              <ModelSelectorList>
                                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                                {composerModelGroups.map((chef) => (
                                  <ModelSelectorGroup heading={chef} key={chef}>
                                    {composerModels
                                      .filter((model) => model.chef === chef)
                                      .map((model) => (
                                        <ModelSelectorItem
                                          key={model.id}
                                          onSelect={() => handleModelSelect(model.id)}
                                          value={model.id}
                                        >
                                          <ModelSelectorLogo provider={model.chefSlug} />
                                          <ModelSelectorName>{model.name}</ModelSelectorName>
                                          <ModelSelectorLogoGroup>
                                            {model.providers.map((provider) => (
                                              <ModelSelectorLogo
                                                key={provider}
                                                provider={provider}
                                              />
                                            ))}
                                          </ModelSelectorLogoGroup>
                                          {selectedModel === model.id ? (
                                            <IconCheck className="ml-auto size-4" />
                                          ) : (
                                            <span className="ml-auto size-4" />
                                          )}
                                        </ModelSelectorItem>
                                      ))}
                                  </ModelSelectorGroup>
                                ))}
                              </ModelSelectorList>
                            </ModelSelectorContent>
                          </ModelSelector>
                        </PromptInputTools>
                        <PromptInputSubmit />
                      </PromptInputFooter>
                    </PromptInput>
                  </div>
                </div>
                  </Sheet>
                </ResizablePanel>

                <ResizableHandle className="w-[5px] bg-transparent after:bg-transparent" />

                <ResizablePanel
                  id="dock"
                  order={2}
                  collapsible
                  collapsedSize={0}
                  defaultSize={isMobile ? (mobileDockOpen ? 100 : 0) : 46}
                  minSize={isMobile ? (mobileDockOpen ? 72 : 0) : 28}
                  panelRef={rightDockRef}
                >
                  <Sheet className={isMobile && !mobileDockOpen ? 'hidden h-full' : 'h-full'}>
                      <TabsContent value="board" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Board"
                          path="Rules, Decisions, Pinned"
                          icon={IconLayoutKanban}
                          onClose={closeRightDock}
                          main={<BoardDock />}
                        />
                      </TabsContent>

                      <TabsContent value="jobs" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Jobs"
                          path="Open, Done, Closed"
                          icon={IconBriefcase}
                          onClose={closeRightDock}
                          main={<JobsDock />}
                        />
                      </TabsContent>

                      <TabsContent value="changes" className={dockWorkspaceContentClassName}>
                        <ChangesViewerPane onClose={closeRightDock} />
                      </TabsContent>

                      <TabsContent value="browser" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Browser"
                          path="http://localhost:1717/workbench"
                          icon={IconWorld}
                          onClose={closeRightDock}
                          main={<BrowserPreviewPane />}
                        />
                      </TabsContent>

                      <TabsContent value="code" className={dockWorkspaceContentClassName}>
                        <SourceViewerPane
                          code={codePaneSource}
                          title="Code"
                          icon={IconCode}
                          language="tsx"
                          onClose={closeRightDock}
                          selectedPath="apps/web/src/routes/workbench.tsx"
                        />
                      </TabsContent>

                      <TabsContent value="docs" className={dockWorkspaceContentClassName}>
                        <SourceViewerPane
                          code={docsPaneSource}
                          title="Docs"
                          icon={IconBook}
                          language="markdown"
                          onClose={closeRightDock}
                          selectedPath="apps/internal/content/projects/chattr/contracts/frontend.mdx"
                        />
                      </TabsContent>

                      <TabsContent value="observability" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Observability"
                          path="OpenTelemetry status and traces"
                          icon={IconActivityHeartbeat}
                          onClose={closeRightDock}
                          main={(
                            <ObservabilityDockPanel
                              isError={observabilityStatusQuery.isError}
                              isLoading={observabilityStatusQuery.isLoading}
                              status={observabilityStatusQuery.data}
                            />
                          )}
                        />
                      </TabsContent>

                      <TabsContent value="terminal" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Terminal"
                          path="codex terminal snapshot"
                          icon={IconTerminal2}
                          onClose={closeRightDock}
                          main={<AgentTerminalPane agentName="codex" />}
                        />
                      </TabsContent>
                  </Sheet>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
        </Tabs>
      </AppShell>
    </TooltipProvider>
  )
}
