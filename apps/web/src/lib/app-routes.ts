export const DEFAULT_WORKSPACE_PUBLIC_ID = 'local'

export const WORKSPACE_ROUTE_PATTERNS = {
  repositories: '/w/:workspacePublicId/repositories',
  settings: '/w/:workspacePublicId/settings/workspace/:sectionId',
  session: '/w/:workspacePublicId/sessions/:sessionHash',
} as const

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
  workspaceRepositories: workspaceRepositoriesRoute(),
  workspaceSettingsAgents: workspaceSettingsRoute({ sectionId: 'agents' }),
  workspaceSettingsGeneral: workspaceSettingsRoute({ sectionId: 'general' }),
  workspaceSettingsMembers: workspaceSettingsRoute({ sectionId: 'members' }),
  workbenchHelper: '/workbench',
} as const

function encodeSegment(value: string) {
  return encodeURIComponent(value)
}

export function workspaceRepositoriesRoute({
  workspacePublicId = DEFAULT_WORKSPACE_PUBLIC_ID,
}: {
  workspacePublicId?: string
} = {}) {
  return `/w/${encodeSegment(workspacePublicId)}/repositories`
}

export function workspaceSettingsRoute({
  sectionId,
  workspacePublicId = DEFAULT_WORKSPACE_PUBLIC_ID,
}: {
  sectionId: 'agents' | 'general' | 'members'
  workspacePublicId?: string
}) {
  return `/w/${encodeSegment(workspacePublicId)}/settings/workspace/${encodeSegment(sectionId)}`
}

export function workspaceSessionRoute({
  sessionHash,
  workspacePublicId = DEFAULT_WORKSPACE_PUBLIC_ID,
}: {
  sessionHash: string
  workspacePublicId?: string
}) {
  return `/w/${encodeSegment(workspacePublicId)}/sessions/${encodeSegment(sessionHash)}`
}
