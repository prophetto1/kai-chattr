'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import {
  CreateProjectDialog,
  type ProjectCreateInput,
} from '@/components/projects/CreateProjectDialog'
import {
  WorkbenchCompactRail,
  type WorkbenchCompactRailEntry,
  type WorkbenchCompactRailItem,
} from '@/components/workbench/WorkbenchCompactRail'
import { APP_ROUTES } from '@/lib/app-routes'
import { AGENT_FIXTURES } from '@/lib/agent-fixtures'

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: '#f59e0b',
  offline: '#94a3b8',
  online: '#10b981',
}

type RailProject = ProjectCreateInput & {
  id: string
}

const railProjectStorageKey = 'kai-chattr-rail-projects-v1'

function projectIdFromName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return `${slug || 'project'}-${Date.now().toString(36)}`
}

function readStoredProjects(): RailProject[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(railProjectStorageKey)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((project): project is RailProject =>
      typeof project?.id === 'string' &&
      typeof project?.name === 'string' &&
      typeof project?.description === 'string' &&
      typeof project?.objectives === 'string'
    )
  } catch {
    return []
  }
}

function writeStoredProjects(projects: RailProject[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(railProjectStorageKey, JSON.stringify(projects))
  } catch {
    // Local persistence is best-effort until the workspace project API exists.
  }
}

type KaiAppRailProps = {
  activeItem?: WorkbenchCompactRailItem
  onNewSession?: () => void
  recentEntries?: WorkbenchCompactRailEntry[]
  taskEntries?: WorkbenchCompactRailEntry[]
  utilities?: (state: { expanded: boolean }) => ReactNode
}

export function KaiAppRail({
  activeItem,
  onNewSession,
  recentEntries,
  taskEntries,
  utilities,
}: KaiAppRailProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>()
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [projects, setProjects] = useState<RailProject[]>([])

  useEffect(() => {
    setProjects(readStoredProjects())
  }, [])

  const activeAgentId = useMemo(() => {
    const prefix = `${APP_ROUTES.agents}/`

    if (!location.pathname.startsWith(prefix)) {
      return undefined
    }

    const id = location.pathname.slice(prefix.length).split('/')[0]

    return id && id !== 'new' ? decodeURIComponent(id) : undefined
  }, [location.pathname])
  const activeAgentEntries = useMemo(
    () =>
      AGENT_FIXTURES.filter((agent) => agent.identity.lifecycle_state === 'active').map((agent) => ({
        accentColor: AGENT_STATUS_COLORS[agent.identity.status] ?? AGENT_STATUS_COLORS.offline,
        id: agent.identity.agent_public_id,
        label: `${agent.identity.name} - ${agent.identity.role}`,
        onSelect: () => navigate(`${APP_ROUTES.agents}/${agent.identity.agent_public_id}`),
      })),
    [navigate]
  )
  const projectEntries = useMemo<WorkbenchCompactRailEntry[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        label: project.name,
        onSelect: () => {
          setActiveProjectId(project.id)
          navigate(APP_ROUTES.projects)
        },
      })),
    [navigate, projects]
  )

  function createProject(input: ProjectCreateInput) {
    const project = {
      ...input,
      id: projectIdFromName(input.name),
    }

    setProjects((current) => {
      const next = [project, ...current]
      writeStoredProjects(next)
      return next
    })
    setActiveProjectId(project.id)
    navigate(APP_ROUTES.projects)
  }

  return (
    <>
      <WorkbenchCompactRail
        account={{
          initials: 'J',
          label: 'Jon',
          secondaryLabel: 'kai-chattr workspace',
          status: 'online',
        }}
        activeAgentId={activeAgentId}
        activeItem={activeItem}
        activeProjectId={activeProjectId}
        agentEntries={activeAgentEntries}
        defaultExpanded={false}
        onAccount={() => navigate(APP_ROUTES.settings)}
        onBilling={() => navigate(APP_ROUTES.settings)}
        onBrand={() => navigate(APP_ROUTES.home)}
        onCreateAgent={() => navigate(APP_ROUTES.agentsNew)}
        onCreateChat={onNewSession ?? (() => navigate(APP_ROUTES.workbenchHelper))}
        onCreateLibrary={() => navigate(APP_ROUTES.libraryNew)}
        onCreateProject={() => setIsProjectDialogOpen(true)}
        onNewSession={onNewSession ?? (() => navigate(APP_ROUTES.workbenchHelper))}
        onNotifications={() => navigate(APP_ROUTES.settings)}
        onOpenAgents={() => navigate(APP_ROUTES.agents)}
        onOpenFileStores={() => navigate(APP_ROUTES.libraryFileStores)}
        onOpenIntegrations={() => navigate(APP_ROUTES.integrations)}
        onOpenKnowledgeBases={() => navigate(APP_ROUTES.libraryKnowledgeBases)}
        onOpenLibrary={() => navigate(APP_ROUTES.library)}
        onOpenObservability={() => navigate(APP_ROUTES.observability)}
        onOpenProjects={() => {
          setActiveProjectId(undefined)
          navigate(APP_ROUTES.projects)
        }}
        onOpenSearch={() => navigate(APP_ROUTES.search)}
        onOpenSettings={() => navigate(APP_ROUTES.settings)}
        onShowConversations={() => navigate(APP_ROUTES.recent)}
        projectEntries={projectEntries}
        recentEntries={recentEntries}
        taskEntries={taskEntries}
        utilities={utilities}
      />
      <CreateProjectDialog
        onCreate={createProject}
        onOpenChange={setIsProjectDialogOpen}
        open={isProjectDialogOpen}
      />
    </>
  )
}
