export const DEFAULT_WORKSPACE_PUBLIC_ID = 'local'

export const APP_ROUTES = {
  agents: '/agents',
  agentsNew: '/agents/new',
  home: '/home',
  integrations: '/integrations',
  library: '/library',
  libraryFileStores: '/library/file-stores',
  libraryKnowledgeBases: '/library/knowledge-bases',
  libraryNew: '/library/new',
  login: '/login',
  observability: '/observability',
  projects: '/projects',
  projectsNew: '/projects/new',
  recent: '/recent',
  search: '/search',
  settings: '/settings/user/account',
  settingsAppearance: '/settings/user/appearance',
  signup: '/signup',
  workbenchHelper: '/workbench',
} as const

export function workspaceSessionRoute({
  sessionHash,
  workspacePublicId = DEFAULT_WORKSPACE_PUBLIC_ID,
}: {
  sessionHash: string
  workspacePublicId?: string
}) {
  return `/w/${encodeURIComponent(workspacePublicId)}/sessions/${encodeURIComponent(sessionHash)}`
}
