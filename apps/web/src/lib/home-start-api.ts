import { chattrJson } from '@/lib/chattr-api'

export type RepositorySummary = {
  id: string
  full_name: string
  git_provider: string
  is_public: boolean
  main_branch: string | null
}

export type BranchSummary = {
  name: string
  commit_sha: string
  protected: boolean
  last_push_date: string | null
}

export type SuggestedTask = {
  id: string
  title: string
  repo: string | null
  git_provider: string | null
  task_type: string
  issue_number: number | null
}

export type ConversationSummary = {
  id: string
  title: string
  selected_repository: string | null
  selected_branch: string | null
  git_provider: string | null
  status: string
  url: string
  created_at: string
  updated_at: string
}

export type PageResult<T> = {
  items: T[]
  next_page_id: string | null
}

export type GitProvider = {
  id: string
  label: string
}

export type CreateConversationResponse = {
  conversation_id: string
  status: string
  url: string
  conversation: ConversationSummary
}

export type CreateConversationInput = {
  repository?: {
    name: string
    branch?: string
    gitProvider?: string
  }
  initial_message?: string
  suggested_task?: SuggestedTask
}

export const CLOUD_GIT_PROVIDERS: GitProvider[] = [
  {
    id: 'github',
    label: 'GitHub',
  },
]

function queryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  return search.toString()
}

export function listRepositories({ provider, query }: { provider: string; query?: string }) {
  const search = queryString({ provider, query })
  return chattrJson<PageResult<RepositorySummary>>(`/api/git/repositories/search?${search}`)
}

export function listBranches({ provider, repository }: { provider: string; repository: string }) {
  const search = queryString({ provider, repository })
  return chattrJson<PageResult<BranchSummary>>(
    `/api/git/branches/search?${search}`
  )
}

export function listRecentConversations() {
  return chattrJson<PageResult<ConversationSummary>>('/api/conversations/recent')
}

export function listSuggestedTasks() {
  return chattrJson<PageResult<SuggestedTask>>('/api/suggested-tasks')
}

export function createConversation(input: CreateConversationInput) {
  return chattrJson<CreateConversationResponse>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
