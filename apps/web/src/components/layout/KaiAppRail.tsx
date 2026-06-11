'use client'

import { type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import {
  WorkbenchCompactRail,
  type WorkbenchCompactRailEntry,
  type WorkbenchCompactRailItem,
} from '@/components/workbench/WorkbenchCompactRail'
import { APP_ROUTES } from '@/lib/app-routes'

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
  const navigate = useNavigate()

  return (
    <WorkbenchCompactRail
      account={{
        initials: 'J',
        label: 'Jon',
        secondaryLabel: 'kai-chattr workspace',
        status: 'online',
      }}
      activeItem={activeItem}
      defaultExpanded={false}
      onAccount={() => navigate(APP_ROUTES.settings)}
      onBilling={() => navigate(APP_ROUTES.settings)}
      onBrand={() => navigate(APP_ROUTES.home)}
      onCreateAgent={() => navigate(APP_ROUTES.agentsNew)}
      onCreateChat={onNewSession ?? (() => navigate(APP_ROUTES.workbenchHelper))}
      onCreateLibrary={() => navigate(APP_ROUTES.libraryNew)}
      onCreateProject={() => navigate(APP_ROUTES.projectsNew)}
      onNewSession={onNewSession ?? (() => navigate(APP_ROUTES.workbenchHelper))}
      onNotifications={() => navigate(APP_ROUTES.settings)}
      onOpenAgents={() => navigate(APP_ROUTES.agents)}
      onOpenFileStores={() => navigate(APP_ROUTES.libraryFileStores)}
      onOpenIntegrations={() => navigate(APP_ROUTES.integrations)}
      onOpenKnowledgeBases={() => navigate(APP_ROUTES.libraryKnowledgeBases)}
      onOpenLibrary={() => navigate(APP_ROUTES.library)}
      onOpenObservability={() => navigate(APP_ROUTES.observability)}
      onOpenProjects={() => navigate(APP_ROUTES.projects)}
      onOpenSearch={() => navigate(APP_ROUTES.search)}
      onOpenSettings={() => navigate(APP_ROUTES.settings)}
      onShowConversations={() => navigate(APP_ROUTES.recent)}
      recentEntries={recentEntries}
      taskEntries={taskEntries}
      utilities={utilities}
    />
  )
}
