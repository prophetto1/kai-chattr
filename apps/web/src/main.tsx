import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'

import { AppThemeProvider } from '@/components/theme/AppThemeProvider'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { Button } from '@/components/ui/button'
import HomePage from './routes/home'
import LandingPage from './routes/landing'
import BoardRulesVisualPage from './routes/board-rules-visual'
import LoginPage from './routes/login'
import ObservabilityPage from './routes/observability'
import SignupPage from './routes/signup'
import SettingsPage from './routes/settings'
import WorkbenchPage from './routes/workbench'
import { ProductSectionPage } from './routes/product-section'
import { WorkspaceRepositoriesPage, WorkspaceSettingsPage } from './routes/workspace-placeholders'
import AgentsRosterPage from './routes/agents'
import AgentDetailPage from './routes/agent-detail'
import AgentCreatePage from './routes/agents-new'
import { APP_ROUTES, WORKSPACE_ROUTE_PATTERNS } from '@/lib/app-routes'
import './styles.css'

function WorkbenchRouteError() {
  const routeError = useRouteError()
  const message =
    routeError instanceof Error
      ? routeError.message
      : 'The workbench hit a render error.'

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Workbench error
        </p>
        <h1 className="mt-2 text-lg font-semibold">The workbench could not render.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => window.location.reload()} type="button">
            Reload
          </Button>
          <Button asChild type="button" variant="outline">
            <a href={APP_ROUTES.home}>Go home</a>
          </Button>
        </div>
      </section>
    </main>
  )
}

const router = createBrowserRouter([
  // Public surfaces (Phase 0 boundary): landing, login, signup (+alias).
  { path: '/', element: <LandingPage /> },
  { path: APP_ROUTES.login, element: <LoginPage /> },
  { path: APP_ROUTES.signup, element: <SignupPage /> },
  // Locked route law names /signup; keep /register as a redirect alias only.
  { path: '/register', element: <Navigate to={APP_ROUTES.signup} replace /> },
  // Everything below requires an auth session (local bootstrap or login).
  {
    element: <RequireAuth />,
    children: [
  { path: APP_ROUTES.home, element: <HomePage /> },
  { path: APP_ROUTES.search, element: <ProductSectionPage activeItem="search" description="Current-user search across conversations and workspace-visible resources." route={APP_ROUTES.search} scope="current user" title="Search" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.integrations, element: <ProductSectionPage activeItem="integrations" description="Workspace integration catalog and connection setup surface." route={APP_ROUTES.integrations} scope="workspace" title="Integrations" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.agents, element: <AgentsRosterPage />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.agentsNew, element: <AgentCreatePage />, errorElement: <WorkbenchRouteError /> },
  { path: `${APP_ROUTES.agents}/:agentPublicId`, element: <AgentDetailPage />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.library, element: <Navigate to={APP_ROUTES.libraryFileStores} replace /> },
  { path: APP_ROUTES.libraryNew, element: <ProductSectionPage activeItem="library" description="Create a new library resource in the current workspace." route={APP_ROUTES.libraryNew} scope="workspace" title="New Library Resource" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.libraryFileStores, element: <ProductSectionPage activeItem="file-stores" description="Workspace file stores available to agents and chat sessions." route={APP_ROUTES.libraryFileStores} scope="workspace" title="File Stores" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.libraryKnowledgeBases, element: <ProductSectionPage activeItem="knowledge-bases" description="Workspace knowledge bases available to agents and chat sessions." route={APP_ROUTES.libraryKnowledgeBases} scope="workspace" title="Knowledge Bases" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.projects, element: <ProductSectionPage activeItem="projects" description="Workspace projects that organize repositories, agents, and sessions." route={APP_ROUTES.projects} scope="workspace" title="Projects" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.projectsNew, element: <ProductSectionPage activeItem="projects" description="Create a project in the current workspace." route={APP_ROUTES.projectsNew} scope="workspace" title="New Project" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.recent, element: <ProductSectionPage activeItem="conversations" description="Recent chats and workspace sessions for the current user." route={APP_ROUTES.recent} scope="current user" title="Recent" />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.observability, element: <ObservabilityPage />, errorElement: <WorkbenchRouteError /> },
  { path: '/settings', element: <Navigate to={APP_ROUTES.settings} replace /> },
  { path: '/settings/user/:sectionId', element: <SettingsPage />, errorElement: <WorkbenchRouteError /> },
  { path: WORKSPACE_ROUTE_PATTERNS.repositories, element: <WorkspaceRepositoriesPage />, errorElement: <WorkbenchRouteError /> },
  { path: WORKSPACE_ROUTE_PATTERNS.settings, element: <WorkspaceSettingsPage />, errorElement: <WorkbenchRouteError /> },
  { path: APP_ROUTES.workbenchHelper, element: <WorkbenchPage />, errorElement: <WorkbenchRouteError /> },
  { path: WORKSPACE_ROUTE_PATTERNS.session, element: <WorkbenchPage />, errorElement: <WorkbenchRouteError /> },
  { path: '/workbench/board-rules-visual', element: <BoardRulesVisualPage /> },
    ],
  },
])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <RouterProvider router={router} />
      </AppThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
