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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Editor } from '@monaco-editor/react'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBriefcase,
  IconCheck,
  IconCode,
  IconExternalLink,
  IconFileText,
  IconGitCompare,
  IconLayoutBottombarCollapse,
  IconLayoutBottombarExpand,
  IconLayoutKanban,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconTerminal2,
  IconWorld,
  IconWorldSearch,
  IconX,
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
import { AgentJoinMenu } from '@/components/workbench/AgentJoinMenu'
import { AgentRuntimeOverlay } from '@/components/workbench/AgentRuntimeOverlay'
import { ChatApprovalCard } from '@/components/workbench/ChatApprovalCard'
import { BoardDock } from '@/components/workbench/BoardDock'
import { DockWorkspace } from '@/components/workbench/DockWorkspace'
import { JobsDock } from '@/components/workbench/JobsDock'
import { JobProposalCard } from '@/components/workbench/JobProposalCard'
import { InteractiveTerminal } from '@/components/workbench/InteractiveTerminal'
import { AgentLauncherDialog } from '@/components/workbench/launcher/AgentLauncherDialog'
import { WorkspaceFileList, WorkspaceFileTree } from '@/components/workbench/WorkspaceFileTree'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  getWorkspaceChanges,
  getWorkspaceDiffDocument,
  getWorkspaceFile,
  getWorkspaceTree,
  monacoLanguageForPath,
  type WorkspaceDiffDocument,
  type WorkspaceDiffFile,
  type WorkspaceDiffLine,
  saveWorkspaceFile,
} from '@/lib/workspace-api'
import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import { type ChattrRoomMessage, useChattrRoom } from '@/hooks/use-chattr-room'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMonacoTheme } from '@/hooks/use-monaco-theme'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'
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
  raw?: ChattrRoomMessage
}

const CHAT_CHANNEL = 'general'
const DOCK_EDITOR_FONT_SIZE = 11

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
  { id: 'docs', label: 'Files', icon: IconBook },
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
      className={`ml-auto flex shrink-0 items-center gap-1.5 ${className ?? ''}`}
      style={typographyStyle('code.stat')}
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
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/25 px-2" style={typographyStyle('ui.caption')}>
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
            fontSize: DOCK_EDITOR_FONT_SIZE,
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

function diffFileSectionId(path: string) {
  return `changes-diff-${encodeURIComponent(path).replace(/%/g, '_')}`
}

function WorkspaceDiffLineRow({ line }: { line: WorkspaceDiffLine }) {
  const marker = line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '

  return (
    <div
      className={cn(
        'grid w-full min-w-0 grid-cols-[3rem_3rem_1rem_minmax(0,1fr)] border-b border-border/10',
        line.kind === 'add' && 'bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
        line.kind === 'delete' && 'bg-rose-500/10 text-rose-950 dark:text-rose-100',
        line.kind === 'context' && 'text-muted-foreground',
      )}
      style={typographyStyle('code.diff')}
    >
      <span className="select-none border-r border-border/15 px-2 text-right text-muted-foreground/70">
        {line.oldLine ?? ''}
      </span>
      <span className="select-none border-r border-border/15 px-2 text-right text-muted-foreground/70">
        {line.newLine ?? ''}
      </span>
      <span
        className={cn(
          'select-none px-1 text-center',
          line.kind === 'add' && 'text-emerald-500',
          line.kind === 'delete' && 'text-rose-500',
        )}
      >
        {marker}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words px-1.5 [overflow-wrap:anywhere]">
        {line.content || ' '}
      </span>
    </div>
  )
}

function WorkspaceDiffFileSection({
  file,
  selected,
}: {
  file: WorkspaceDiffFile
  selected: boolean
}) {
  return (
    <section
      className={cn(
        'min-w-0 border-b border-border/40 bg-background',
        selected && 'border-l-2 border-l-emerald-500',
      )}
      data-testid="changes-diff-file"
      id={diffFileSectionId(file.path)}
    >
      <div className="sticky top-0 z-10 flex h-9 min-w-0 items-center gap-2 border-b border-border/30 bg-background/95 px-2 backdrop-blur" style={typographyStyle('ui.caption')}>
        <IconFileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.path}</span>
        <span className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground" style={typographyStyle('ui.overline')}>
          {file.status}
        </span>
        <ChangeCounts additions={file.additions} deletions={file.deletions} />
      </div>

      {file.binary || file.tooLarge ? (
        <p className="px-3 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>
          {file.binary ? 'Binary file diff is not shown.' : 'File is too large for inline diff.'}
        </p>
      ) : file.hunks.length === 0 ? (
        <p className="px-3 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>
          No textual hunks available for this file.
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden">
          {file.hunks.map((hunk) => (
            <div
              key={`${file.path}:${hunk.oldStart}:${hunk.newStart}:${hunk.lines.length}`}
              className="w-full min-w-0"
            >
              <div className="w-full min-w-0 break-words border-b border-border/20 bg-muted/25 px-2 py-1 text-muted-foreground [overflow-wrap:anywhere]" style={typographyStyle('code.diff')}>
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                {hunk.section ? ` ${hunk.section}` : ''}
              </div>
              {hunk.lines.map((line, index) => (
                <WorkspaceDiffLineRow
                  key={`${line.kind}:${line.oldLine ?? 'x'}:${line.newLine ?? 'x'}:${index}`}
                  line={line}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function WorkspaceDiffDocumentView({
  document,
  selectedPath,
}: {
  document: WorkspaceDiffDocument
  selectedPath: string
}) {
  if (document.files.length === 0) {
    return <p className="px-3 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>No changes in the working tree.</p>
  }

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-background" data-testid="changes-diff-document">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/25 bg-muted/15 px-2" style={typographyStyle('ui.caption')}>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {document.files.length} changed {document.files.length === 1 ? 'file' : 'files'}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {document.contextLines} context lines
        </span>
      </div>
      {document.files.map((file) => (
        <WorkspaceDiffFileSection
          file={file}
          key={file.path}
          selected={file.path === selectedPath}
        />
      ))}
    </div>
  )
}

function ChangesViewerPane({ onClose }: { onClose?: () => void }) {
  const [selectedPath, setSelectedPath] = useState('')
  const changesQuery = useQuery({
    queryKey: ['workspace-changes'],
    queryFn: getWorkspaceChanges,
    refetchInterval: 15000,
  })
  const diffDocumentQuery = useQuery({
    queryKey: ['workspace-diff-document', 3, 0],
    queryFn: () => getWorkspaceDiffDocument({ context: 3, interHunkContext: 0 }),
    refetchInterval: 15000,
  })
  const changes = changesQuery.data?.changes ?? []
  const effectivePath = changes.some((change) => change.path === selectedPath)
    ? selectedPath
    : changes[0]?.path ?? ''
  const handleSelectChange = useCallback((path: string) => {
    setSelectedPath(path)
    requestAnimationFrame(() => {
      document.getElementById(diffFileSectionId(path))?.scrollIntoView({ block: 'start' })
    })
  }, [])

  return (
    <DockWorkspace
      title="Changes"
      path={changes.length > 0 ? `${changes.length} changed files` : 'working tree'}
      icon={IconGitCompare}
      onClose={onClose}
      showSidebarLabel={false}
      scrollSidebar={false}
      sidebarClassName="bg-background"
      sidebarDefaultSize="30%"
      sidebarMinSize="20%"
      sidebar={
        <WorkspaceFileList
          emptyText={
            changesQuery.isError
              ? changesQuery.error instanceof Error
                ? `${changesQuery.error.message} — restart the API if /api/workspace routes are new.`
                : 'Changes unavailable.'
              : changesQuery.isLoading
                ? 'Loading changes...'
                : 'No changes in the working tree.'
          }
          entries={changes}
          headerIcon={IconGitCompare}
          headerLabel="All changes"
          onSelect={handleSelectChange}
          selectedPath={effectivePath}
          showStats
        />
      }
      main={
        diffDocumentQuery.isError ? (
          <p className="px-3 py-4 text-destructive" style={typographyStyle('ui.caption')}>
            {diffDocumentQuery.error instanceof Error
              ? diffDocumentQuery.error.message
              : 'Diff document unavailable.'}
          </p>
        ) : diffDocumentQuery.isLoading ? (
          <p className="px-3 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>Loading diff...</p>
        ) : (
          <WorkspaceDiffDocumentView
            document={
              diffDocumentQuery.data ?? {
                baseRef: 'HEAD',
                compareRef: 'WORKTREE',
                contextLines: 3,
                files: [],
                interHunkContext: 0,
                root: changesQuery.data?.root ?? 'workspace',
              }
            }
            selectedPath={effectivePath}
          />
        )
      }
    />
  )
}

function CodeEditorPane({
  onClose,
  readOnly = false,
  title,
}: {
  onClose?: () => void
  readOnly?: boolean
  title: string
}) {
  const monacoTheme = useMonacoTheme()
  const queryClient = useQueryClient()
  const [selectedPath, setSelectedPath] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const treeQuery = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: getWorkspaceTree,
    staleTime: 60_000,
  })
  const files = treeQuery.data?.files ?? []
  const fileQuery = useQuery({
    enabled: Boolean(selectedPath),
    queryKey: ['workspace-file', selectedPath],
    queryFn: () => getWorkspaceFile(selectedPath),
  })
  const baseContent = fileQuery.data?.content
  const content = draft ?? baseContent ?? ''
  const dirty = !readOnly && draft !== null && draft !== baseContent
  const saveMutation = useMutation({
    mutationFn: () => saveWorkspaceFile(selectedPath, draft ?? ''),
    onSuccess: async () => {
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: ['workspace-file', selectedPath] })
      await queryClient.invalidateQueries({ queryKey: ['workspace-changes'] })
      await queryClient.invalidateQueries({ queryKey: ['workspace-diff-document'] })
      await queryClient.invalidateQueries({ queryKey: ['workspace-diff', selectedPath] })
    },
  })

  const handleTreeSelect = useCallback((path: string) => {
    setSelectedPath(path)
    setDraft(null)
  }, [])

  return (
    <DockWorkspace
      title={title}
      path={selectedPath || 'select a file'}
      icon={readOnly ? IconBook : IconCode}
      onClose={onClose}
      showSidebarLabel={false}
      scrollSidebar={false}
      sidebarClassName="bg-background"
      sidebarDefaultSize="30%"
      sidebarMinSize="20%"
      sidebar={
        <WorkspaceFileTree
          emptyText={
            treeQuery.isError
              ? treeQuery.error instanceof Error
                ? `${treeQuery.error.message} — restart the API if /api/workspace routes are new.`
                : 'Files unavailable.'
              : treeQuery.isLoading
                ? 'Loading files...'
                : 'No files.'
          }
          entries={files.map((path) => ({ path }))}
          headerIcon={readOnly ? IconBook : IconCode}
          headerLabel={treeQuery.data?.root ?? 'workspace'}
          onSelect={handleTreeSelect}
          rootName={treeQuery.data?.root ?? 'workspace'}
          searchable
          selectedPath={selectedPath}
        />
      }
      main={
        selectedPath ? (
          <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/25 bg-muted/15 px-2" style={typographyStyle('ui.caption')}>
              <div className="min-w-0 flex-1 truncate font-medium text-foreground">
                {selectedPath}
                {dirty ? <span className="ml-1.5 text-amber-500">●</span> : null}
              </div>
              {fileQuery.isError ? (
                <span className="shrink-0 text-destructive">
                  {fileQuery.error instanceof Error ? fileQuery.error.message : 'Unavailable'}
                </span>
              ) : null}
              {saveMutation.isError ? (
                <span className="shrink-0 text-destructive">
                  {saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : 'Save failed'}
                </span>
              ) : null}
              {!readOnly ? (
                <Button
                  className="h-6 shrink-0 px-2"
                  style={typographyStyle('ui.caption')}
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  size="sm"
                  type="button"
                  variant={dirty ? 'default' : 'outline'}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              ) : null}
            </div>
            <div
              className="min-h-0 flex-1"
              data-dock-editor-font-size={DOCK_EDITOR_FONT_SIZE}
              data-testid={readOnly ? 'files-code-viewer' : 'code-code-viewer'}
            >
              <Editor
                language={monacoLanguageForPath(selectedPath)}
                theme={monacoTheme}
                onChange={readOnly ? undefined : (value) => setDraft(value ?? '')}
                options={{
                  fontSize: DOCK_EDITOR_FONT_SIZE,
                  lineDecorationsWidth: 12,
                  lineNumbersMinChars: 3,
                  minimap: { enabled: false },
                  padding: { top: 12 },
                  readOnly,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                }}
                path={`workspace:///${selectedPath}`}
                value={content}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-background">
            <p className="text-muted-foreground" style={typographyStyle('ui.caption')}>Select a file from the tree.</p>
          </div>
        )
      }
    />
  )
}

type TerminalTab = {
  id: string
  label: string
}

function TerminalTabsPane() {
  const nextTerminalIndexRef = useRef(2)
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'terminal-1', label: 'Terminal 1' },
  ])
  const [activeTabId, setActiveTabId] = useState('terminal-1')

  const addTerminal = useCallback(() => {
    const index = nextTerminalIndexRef.current
    nextTerminalIndexRef.current += 1
    const nextTab = { id: `terminal-${index}`, label: `Terminal ${index}` }
    setTabs((current) => [...current, nextTab])
    setActiveTabId(nextTab.id)
  }, [])

  const closeTerminal = useCallback((tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        return current
      }

      const closedIndex = current.findIndex((tab) => tab.id === tabId)
      const nextTabs = current.filter((tab) => tab.id !== tabId)
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) {
          return currentActive
        }
        return nextTabs[Math.max(0, closedIndex - 1)]?.id ?? nextTabs[0]?.id ?? currentActive
      })
      return nextTabs
    })
  }, [])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#09090b]" data-testid="terminal-tabs-pane">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/30 bg-background px-1.5">
        <div
          aria-label="Terminal sessions"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          data-testid="terminal-tab-list"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId

            return (
              <div
                className={cn(
                  'flex h-6 min-w-0 shrink-0 items-center rounded border border-transparent',
                  isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                )}
                key={tab.id}
              >
                <button
                  aria-controls={`${tab.id}-panel`}
                  aria-label={tab.label}
                  aria-selected={isActive}
                  className="flex h-full min-w-0 items-center gap-1.5 px-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  style={typographyStyle('ui.caption')}
                  id={`${tab.id}-tab`}
                  onClick={() => setActiveTabId(tab.id)}
                  role="tab"
                  type="button"
                >
                  <IconTerminal2 className="size-3 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
                {tabs.length > 1 ? (
                  <button
                    aria-label={`Close ${tab.label}`}
                    className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTerminal(tab.id)
                    }}
                    type="button"
                  >
                    <IconX className="size-3" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <Button
          aria-label="New terminal"
          className="size-6 shrink-0 rounded"
          data-testid="new-terminal-button"
          onClick={addTerminal}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconPlus className="size-3.5" />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <div
              aria-labelledby={`${tab.id}-tab`}
              className={cn('absolute inset-0 min-h-0 min-w-0', !isActive && 'invisible pointer-events-none')}
              data-testid="terminal-session-panel"
              id={`${tab.id}-panel`}
              key={tab.id}
              role="tabpanel"
            >
              <InteractiveTerminal active={isActive} />
            </div>
          )
        })}
      </div>
    </div>
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
    raw: message,
    role: message.sender === 'user' ? 'user' : 'assistant',
    sender: message.sender,
    text: message.text,
  }
}

function WorkbenchChatMessage({
  index,
  message,
  onJobAccepted,
}: {
  index: number
  message: WorkbenchMessage
  onJobAccepted?: (jobId: number) => void
}) {
  const kind = message.raw?.type
  if (kind === 'approval_card' && message.raw) {
    return (
      <div className="flex w-full justify-start">
        <ChatApprovalCard message={message.raw} />
      </div>
    )
  }
  if (kind === 'job_proposal' && message.raw) {
    return (
      <div className="flex w-full justify-start">
        <JobProposalCard message={message.raw} onAccepted={onJobAccepted} />
      </div>
    )
  }
  if (kind === 'join' || kind === 'leave') {
    return (
      <div className="py-0.5 text-center text-xs text-muted-foreground">
        {message.text}
      </div>
    )
  }
  return (
    <Message className="gap-1.5" from={message.role} key={`${message.role}-${index}`}>
      <MessageContent className="gap-1.5 group-[.is-user]:px-3.5 group-[.is-user]:py-2.5" style={typographyStyle('ui.body')}>
        {message.reasoning && (
          <Reasoning className="mb-2.5" defaultOpen={false} duration={14}>
            <ReasoningTrigger />
            <ReasoningContent>{message.reasoning}</ReasoningContent>
          </Reasoning>
        )}
        <MessageResponse className="[&_li]:leading-[1.45] [&_p]:leading-[1.45]" style={typographyStyle('ui.body')}>
          {message.text}
        </MessageResponse>
        {message.tool && (
          <Tool className="mt-2.5" defaultOpen={false}>
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
          <Sources className="mt-2.5">
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

function WorkbenchLowerPane() {
  return (
    <div
      aria-hidden="true"
      className="h-full bg-background"
      data-testid="workbench-lower-pane"
    />
  )
}

export default function WorkbenchPage() {
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null)
  const lowerPaneRef = useRef<PanelImperativeHandle | null>(null)
  const rightDockRef = useRef<PanelImperativeHandle | null>(null)
  const isMobile = useIsMobile()
  const [activeDockTab, setActiveDockTab] = useState<DockTabId>('board')
  const [lowerPaneOpen, setLowerPaneOpen] = useState(true)
  const [mobileDockOpen, setMobileDockOpen] = useState(false)
  const { messages: roomMessages, sendMessage } = useChattrRoom({ channel: CHAT_CHANNEL })
  const chatMessages = useMemo(
    () => roomMessages.map(toWorkbenchMessage),
    [roomMessages]
  )
  const [composerText, setComposerText] = useState('')
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [agentLauncherOpen, setAgentLauncherOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<(typeof composerModels)[number]['id']>(
    composerModels[0].id
  )
  const selectedModelData = useMemo(
    () => composerModels.find((model) => model.id === selectedModel) ?? composerModels[0],
    [selectedModel]
  )
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

  const handleJobAccepted = useCallback((_jobId: number) => {
    openDockTab('jobs')
  }, [openDockTab])

  const handleNewSession = useCallback(() => {
    setComposerText('')
  }, [])

  const toggleLowerPane = useCallback(() => {
    const panel = lowerPaneRef.current

    if (lowerPaneOpen) {
      panel?.collapse()
      setLowerPaneOpen(false)
      return
    }

    panel?.expand()
    setLowerPaneOpen(true)
  }, [lowerPaneOpen])

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
          <KaiAppRail
            activeItem="conversations"
            onNewSession={handleNewSession}
          />
        )}
      >
        <Tabs
          className="jwc-workbench-shell flex min-h-0 flex-1 overflow-hidden text-foreground antialiased"
          style={typographyStyle('ui.body')}
          onValueChange={handleDockTabChange}
          orientation="vertical"
          value={activeDockTab}
        >
          <div className="flex min-h-0 flex-1 gap-[5px] overflow-hidden">
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
                    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-foreground">
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="min-w-0 truncate text-xs font-medium text-foreground">
                        Workbench session
                      </span>
                      <AgentJoinMenu className="ml-auto" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={lowerPaneOpen ? 'Hide lower pane' : 'Show lower pane'}
                            className="size-8 rounded-[5px] text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
                            data-testid="workbench-lower-pane-toggle"
                            onClick={toggleLowerPane}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {lowerPaneOpen ? (
                              <IconLayoutBottombarCollapse className="size-4" />
                            ) : (
                              <IconLayoutBottombarExpand className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {lowerPaneOpen ? 'Hide lower pane' : 'Show lower pane'}
                        </TooltipContent>
                      </Tooltip>
                    </header>
                    <ResizablePanelGroup className="min-h-0 flex-1" direction="vertical">
                      <ResizablePanel id="chat-main" order={1} defaultSize={78} minSize={42}>
                        <div className="flex h-full min-h-0 flex-col">
                <Conversation className="flex-1">
                  <ConversationContent className="w-full max-w-none gap-4 px-4 py-5">
                    {chatMessages.map((m, i) => (
                      <WorkbenchChatMessage
                        index={i}
                        key={m.id ?? `${m.role}-${i}`}
                        message={m}
                        onJobAccepted={handleJobAccepted}
                      />
                    ))}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
                <div className="shrink-0 px-4 pb-4 pt-1.5">
                  <div className="grid min-w-0 w-full max-w-none gap-2">
                    <AgentLauncherDialog
                      hideTrigger
                      onOpenChange={setAgentLauncherOpen}
                      open={agentLauncherOpen}
                    />
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
                              <DropdownMenuItem onSelect={() => setAgentLauncherOpen(true)}>
                                <IconRobot className="size-4" />
                                Add agent
                              </DropdownMenuItem>
                              <DropdownMenuCheckboxItem
                                checked={useWebSearch}
                                onCheckedChange={() => toggleWebSearch()}
                              >
                                <IconWorldSearch className="size-4" />
                                Web search
                              </DropdownMenuCheckboxItem>
                            </PromptInputActionMenuContent>
                          </PromptInputActionMenu>
                          <SpeechInput
                            className="shrink-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                            onTranscriptionChange={handleTranscriptionChange}
                            size="icon-sm"
                            variant="ghost"
                          />
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
                        </div>
                      </ResizablePanel>
                      <ResizableHandle
                        className={cn(
                          'h-[5px] bg-transparent after:bg-transparent',
                          !lowerPaneOpen && 'hidden'
                        )}
                      />
                      <ResizablePanel
                        id="chat-lower"
                        order={2}
                        collapsible
                        collapsedSize={0}
                        defaultSize={22}
                        minSize={14}
                        panelRef={lowerPaneRef}
                      >
                        <WorkbenchLowerPane />
                      </ResizablePanel>
                    </ResizablePanelGroup>
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
                          path="To do, Active, Closed"
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
                        <CodeEditorPane onClose={closeRightDock} title="Code" />
                      </TabsContent>

                      <TabsContent value="docs" className={dockWorkspaceContentClassName}>
                        <CodeEditorPane onClose={closeRightDock} readOnly title="Files" />
                      </TabsContent>

                      <TabsContent value="terminal" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Terminal"
                          path="interactive · /ws/terminals"
                          icon={IconTerminal2}
                          onClose={closeRightDock}
                          main={<TerminalTabsPane />}
                        />
                      </TabsContent>
                  </Sheet>
                </ResizablePanel>
              </ResizablePanelGroup>
              <div className="-mr-[5px] flex h-full w-10 shrink-0 flex-col">
                <TabsList
                  aria-label="Workbench dock"
                  className="flex w-full flex-1 flex-col justify-start gap-1 rounded-none bg-transparent px-1.5 pb-1.5 pt-[67px]"
                  variant="line"
                >
                  {dockTabs.map((tab) => {
                    const DockIcon = tab.icon

                    return (
                      <TabsTrigger
                        aria-label={tab.label}
                        className="h-8 w-8 flex-none justify-center rounded-[5px] px-0 text-[var(--wb-tab-icon)] data-[state=active]:bg-accent data-[state=active]:text-[var(--wb-tab-icon-active)] after:hidden active:scale-95"
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
                <div className="flex justify-center px-1.5">
                  <AgentRuntimeOverlay />
                </div>
              </div>
            </div>
        </Tabs>
      </AppShell>
    </TooltipProvider>
  )
}
