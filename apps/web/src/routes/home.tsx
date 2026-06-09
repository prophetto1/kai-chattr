import {
  IconBrandGithub,
  IconFolderOpen,
  IconGitBranch,
  IconGitFork,
  IconPlus,
  IconRobot,
} from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { WorkbenchCompactRail } from '@/components/workbench/WorkbenchCompactRail'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createConversation,
  listBranches,
  listRecentConversations,
  listRepositories,
  listSuggestedTasks,
  type BranchSummary,
  type ConversationSummary,
  type RepositorySummary,
  type SuggestedTask,
} from '@/lib/home-start-api'

function EmptyText({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function OpenRepositoryCard({
  branches,
  branchesLoading,
  canCreate,
  onCreate,
  repositories,
  selectedBranch,
  selectedRepository,
  setSelectedBranch,
  setSelectedRepository,
}: {
  branches: BranchSummary[]
  branchesLoading: boolean
  canCreate: boolean
  onCreate: () => void
  repositories: RepositorySummary[]
  selectedBranch: string
  selectedRepository: RepositorySummary | null
  setSelectedBranch: (branch: string) => void
  setSelectedRepository: (repository: RepositorySummary | null) => void
}) {
  return (
    <Card className="min-h-[236px] border-border bg-card/80 py-0 shadow-sm">
      <CardHeader className="gap-2 px-5 pt-5">
        <CardTitle aria-level={2} className="flex items-center gap-2 text-base" role="heading">
          <IconGitFork className="size-4" />
          Open Repository
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Select or insert a URL
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5 pb-5">
        <Select
          onValueChange={(value) => {
            setSelectedBranch('')
            setSelectedRepository(
              repositories.find((repository) => repository.full_name === value) ?? null
            )
          }}
          value={selectedRepository?.full_name ?? ''}
        >
          <SelectTrigger aria-label="Repository" className="w-full">
            <SelectValue placeholder="user/repo" />
          </SelectTrigger>
          <SelectContent>
            {repositories.map((repository) => (
              <SelectItem key={repository.id} value={repository.full_name}>
                {repository.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          disabled={!selectedRepository}
          onValueChange={setSelectedBranch}
          value={selectedBranch}
        >
          <SelectTrigger aria-label="Branch" className="w-full">
            <SelectValue
              placeholder={
                !selectedRepository
                  ? 'Select repository first'
                  : branchesLoading
                    ? 'Loading branches...'
                    : 'Select branch...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.name} value={branch.name}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          className="mt-auto w-full active:scale-95"
          disabled={!canCreate}
          onClick={onCreate}
          type="button"
        >
          Launch
        </Button>
      </CardContent>
    </Card>
  )
}

function NewConversationCard({
  disabled,
  onCreate,
}: {
  disabled: boolean
  onCreate: () => void
}) {
  return (
    <Card className="min-h-[236px] border-border bg-card/80 py-0 shadow-sm">
      <CardHeader className="gap-2 px-5 pt-5">
        <CardTitle aria-level={2} className="flex items-center gap-2 text-base" role="heading">
          <IconPlus className="size-4" />
          Start from Scratch
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Start a new conversation that is not connected to an existing repository.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto px-5 pb-5">
        <Button
          className="w-full active:scale-95"
          disabled={disabled}
          onClick={onCreate}
          type="button"
        >
          New Conversation
        </Button>
      </CardContent>
    </Card>
  )
}

function PlaceholderStartCard({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof IconRobot
  title: string
}) {
  return (
    <Card className="min-h-[236px] border-border bg-card/60 py-0 shadow-sm">
      <CardHeader className="gap-2 px-5 pt-5">
        <CardTitle aria-level={2} className="flex items-center gap-2 text-base" role="heading">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto px-5 pb-5">
        <Button className="w-full" disabled type="button" variant="secondary">
          Coming soon
        </Button>
      </CardContent>
    </Card>
  )
}

function RecentConversationsList({
  conversations,
}: {
  conversations: ConversationSummary[]
}) {
  return (
    <section className="min-w-0">
      <h2 className="px-1 py-3 text-xs font-semibold">Recent Conversations</h2>
      {conversations.length === 0 ? (
        <EmptyText>No recent conversations</EmptyText>
      ) : (
        <div className="flex flex-col gap-1">
          {conversations.slice(0, 3).map((conversation) => (
            <a
              className="rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
              href={conversation.url}
              key={conversation.id}
            >
              <span className="block truncate text-sm font-medium">{conversation.title}</span>
              <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <IconBrandGithub className="size-3" />
                {conversation.selected_repository ?? 'No Repository'}
                {conversation.selected_branch ? (
                  <>
                    <IconGitBranch className="size-3" />
                    {conversation.selected_branch}
                  </>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function SuggestedTasksList({ tasks }: { tasks: SuggestedTask[] }) {
  return (
    <section className="min-w-0">
      <h2 className="px-1 py-3 text-xs font-semibold">Suggested Tasks</h2>
      {tasks.length === 0 ? (
        <EmptyText>No tasks available</EmptyText>
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.slice(0, 3).map((task) => (
            <button
              className="rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent active:scale-[0.99]"
              key={task.id}
              type="button"
            >
              <span className="block truncate text-sm font-medium">{task.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {task.repo ?? 'No repository'}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const [selectedRepository, setSelectedRepository] = useState<RepositorySummary | null>(null)
  const [selectedBranch, setSelectedBranch] = useState('')

  const repositories = useQuery({
    queryKey: ['home-start', 'repositories'],
    queryFn: listRepositories,
  })
  const branches = useQuery({
    enabled: !!selectedRepository,
    queryKey: ['home-start', 'branches', selectedRepository?.full_name],
    queryFn: () => listBranches(selectedRepository?.full_name ?? ''),
  })
  const recentConversations = useQuery({
    queryKey: ['home-start', 'recent-conversations'],
    queryFn: listRecentConversations,
  })
  const suggestedTasks = useQuery({
    queryKey: ['home-start', 'suggested-tasks'],
    queryFn: listSuggestedTasks,
  })

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (response) => {
      window.location.assign(response.url)
    },
  })

  const repositoryItems = repositories.data?.items ?? []
  const branchItems = branches.data?.items ?? []
  const recentItems = recentConversations.data?.items ?? []
  const taskItems = suggestedTasks.data?.items ?? []
  const apiError = useMemo(
    () =>
      repositories.error ??
      branches.error ??
      recentConversations.error ??
      suggestedTasks.error ??
      createMutation.error,
    [
      branches.error,
      createMutation.error,
      recentConversations.error,
      repositories.error,
      suggestedTasks.error,
    ]
  )
  const creating = createMutation.isPending

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <WorkbenchCompactRail
        account={{
          initials: 'J',
          label: 'Jon',
          secondaryLabel: 'kai-chattr workspace',
          status: 'online',
        }}
        activeItem="new-session"
        defaultExpanded={false}
        onBrand={() => navigate('/home')}
        onNewSession={() => createMutation.mutate({})}
        onOpenSettings={() => navigate('/settings')}
        onShowConversations={() => navigate('/home')}
      />
      <section className="flex min-w-0 flex-1 justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-[720px]">
          <h1 className="mt-16 text-center text-3xl font-semibold tracking-normal text-foreground">
            Let's Start Building!
          </h1>

          {apiError ? (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Home API error: {apiError instanceof Error ? apiError.message : 'Unknown error'}
            </div>
          ) : null}

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <OpenRepositoryCard
              branches={branchItems}
              branchesLoading={branches.isFetching}
              canCreate={!!selectedRepository && !!selectedBranch && !creating}
              onCreate={() => {
                if (!selectedRepository || !selectedBranch) return
                createMutation.mutate({
                  repository: {
                    name: selectedRepository.full_name,
                    branch: selectedBranch,
                    gitProvider: selectedRepository.git_provider,
                  },
                })
              }}
              repositories={repositoryItems}
              selectedBranch={selectedBranch}
              selectedRepository={selectedRepository}
              setSelectedBranch={setSelectedBranch}
              setSelectedRepository={setSelectedRepository}
            />
            <NewConversationCard
              disabled={creating}
              onCreate={() => createMutation.mutate({})}
            />
            <PlaceholderStartCard
              description="Create a reusable agent configuration for cloud or local runtime use."
              icon={IconRobot}
              title="Design an Agent"
            />
            <PlaceholderStartCard
              description="Select a local folder and connect it through a local runtime bridge."
              icon={IconFolderOpen}
              title="Open a Local Repository"
            />
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <RecentConversationsList conversations={recentItems} />
            <SuggestedTasksList tasks={taskItems} />
          </div>
        </div>
      </section>
    </main>
  )
}
