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

export function listRepositories() {
  return chattrJson<PageResult<RepositorySummary>>('/api/repositories')
}

export function listBranches(repository: string) {
  return chattrJson<PageResult<BranchSummary>>(
    `/api/repositories/${repository}/branches`
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
