'use client'

/*
 * JWC Workbench - first shell slice (mock data).
 *
 * Full-bleed 3-pane IDE shell: slim header, left rail, center chat, and right
 * dock. UI controls are composed from shadcn/ui primitives and Vercel AI
 * Elements rather than local lookalikes.
 */

import { type ComponentType, useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { DiffEditor, Editor } from '@monaco-editor/react'
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
import { Terminal } from '@/components/ai-elements/terminal'
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
import { WorkbenchSettingsDialog } from '@/components/workbench/WorkbenchSettingsDialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useMonacoTheme } from '@/hooks/use-monaco-theme'
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
  role: 'assistant' | 'user'
  text: string
  reasoning?: string
  sources?: Array<{ title: string; href: string }>
  tool?: {
    name: string
    input: Record<string, unknown>
    output: Record<string, unknown>
  }
}

const initialMessages: WorkbenchMessage[] = [
  {
    role: 'assistant',
    text: 'The content needs to be addressed in the audit.',
    reasoning:
      'Use the installed component catalogs as the source of truth. If a workbench surface maps to shadcn/ui or Vercel AI Elements, compose that source component instead of writing a local visual equivalent.',
    sources: [
      {
        title: 'Vercel AI Elements catalog',
        href: 'https://elements.ai-sdk.dev/',
      },
      {
        title: 'shadcn/ui component catalog',
        href: 'https://ui.shadcn.com/docs/components',
      },
    ],
    tool: {
      name: 'memory_search',
      input: {
        query: 'jwc-global workbench kai-chattr no handrolled shadcn ai elements',
      },
      output: {
        rule: 'No handrolled substitutes when approved source components exist.',
        scope: 'jwc-global and kai-chattr workbench surfaces',
      },
    },
  },
  { role: 'user', text: 'please proceed' },
  {
    role: 'assistant',
    text: 'Done - steps 2 and 3 complete the authoritative plan. Verified the green checks plus the new canaries, then re-gated.',
  },
]

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

type DockTabId = 'board' | 'jobs' | 'changes' | 'browser' | 'code' | 'docs' | 'terminal'
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
  { id: 'terminal', label: 'Terminal', icon: IconTerminal2 },
]

const terminalOutput = `$ pnpm dev
> Next.js 16.2.6 (turbopack)
- Local: http://localhost:1717
OK Ready in 1.2s`

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
- Terminal starts with AI Elements Terminal until xterm.js is attached.`

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

export default function WorkbenchPage() {
  const navigate = useNavigate()
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null)
  const rightDockRef = useRef<PanelImperativeHandle | null>(null)
  const isMobile = useIsMobile()
  const [activeDockTab, setActiveDockTab] = useState<DockTabId>('board')
  const [mobileDockOpen, setMobileDockOpen] = useState(true)
  const [chatMessages, setChatMessages] = useState(initialMessages)
  const [composerText, setComposerText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
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

  const appendUserMessage = useCallback((text: string) => {
    setChatMessages((current) => [...current, { role: 'user', text }])
  }, [])

  const handleNewSession = useCallback(() => {
    setChatMessages(initialMessages)
    setComposerText('')
  }, [])

  const handleComposerSubmit = useCallback((message: PromptInputMessage) => {
    const text = message.text.trim()
    const attachmentCount = message.files.length

    if (!text && attachmentCount === 0) {
      return
    }

    appendUserMessage(
      text || `Sent ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`
    )
    setComposerText('')
  }, [appendUserMessage])

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
      <Tabs
        className="jwc-workbench-shell gap-0 overflow-hidden bg-background text-[13px] text-foreground antialiased"
        onValueChange={handleDockTabChange}
        value={activeDockTab}
      >
        <WorkbenchSettingsDialog
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          trigger={null}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkbenchCompactRail
            account={{
              initials: 'J',
              label: 'Jon',
              secondaryLabel: 'kai-chattr workspace',
              status: 'online',
            }}
            activeItem="conversations"
            onAccount={() => setSettingsOpen(true)}
            onBilling={() => setSettingsOpen(true)}
            onBrand={() => navigate('/home')}
            onNewSession={handleNewSession}
            onNotifications={() => setSettingsOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <header className="flex h-10 shrink-0 items-center gap-2 bg-background px-3 text-foreground">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate text-xs font-medium text-foreground">Workbench session</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <TabsList
                  variant="line"
                  className="h-8 gap-1 rounded-none bg-transparent p-0"
                >
                  {dockTabs.map((tab) => {
                    const DockIcon = tab.icon

                    return (
                      <TabsTrigger
                        aria-label={tab.label}
                        className="h-8 flex-none px-2.5 text-[var(--wb-tab-icon)] data-[state=active]:text-[var(--wb-tab-icon-active)] after:hidden active:scale-95"
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

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <ResizablePanelGroup
                className="min-w-0 flex-1"
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
                  <div className="flex h-full flex-col bg-background">
                <Conversation className="flex-1">
                  <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6">
                    {chatMessages.map((m, i) => (
                      <WorkbenchChatMessage
                        index={i}
                        key={`${m.role}-${i}`}
                        message={m}
                      />
                    ))}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
                <div className="shrink-0 px-4 pb-4 pt-1.5">
                  <div className="mx-auto grid w-full max-w-3xl gap-2">
                    <PromptInput
                      globalDrop
                      multiple
                      onSubmit={handleComposerSubmit}
                    >
                      <PromptInputHeader>
                        <ComposerAttachmentsDisplay />
                      </PromptInputHeader>
                      <PromptInputBody>
                        <PromptInputTextarea
                          className="min-h-[72px]"
                          onChange={handleComposerTextChange}
                          placeholder="Run task with Claude — type / for commands"
                          value={composerText}
                        />
                      </PromptInputBody>
                      <PromptInputFooter>
                        <PromptInputTools>
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
                            <span>Search</span>
                          </PromptInputButton>
                          <ModelSelector
                            onOpenChange={setModelSelectorOpen}
                            open={modelSelectorOpen}
                          >
                            <ModelSelectorTrigger asChild>
                              <PromptInputButton tooltip="Select model">
                                <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                                <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
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

                <ResizableHandle className="bg-transparent" />

                <ResizablePanel
                  id="dock"
                  order={2}
                  collapsible
                  collapsedSize={0}
                  defaultSize={isMobile ? (mobileDockOpen ? 100 : 0) : 46}
                  minSize={isMobile ? (mobileDockOpen ? 72 : 0) : 28}
                  panelRef={rightDockRef}
                >
                  <div className="h-full min-h-0 bg-background pb-[5px] pr-[5px]">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md bg-card">
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

                      <TabsContent value="terminal" className={dockWorkspaceContentClassName}>
                        <DockWorkspace
                          title="Terminal"
                          path="pnpm dev"
                          icon={IconTerminal2}
                          onClose={closeRightDock}
                          main={<Terminal className="h-full rounded-none border-0" output={terminalOutput} />}
                        />
                      </TabsContent>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </div>
      </Tabs>
    </TooltipProvider>
  )
}
