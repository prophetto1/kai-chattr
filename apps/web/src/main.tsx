import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, useRouteError } from 'react-router'
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
import { Button } from '@/components/ui/button'
import HomePage from './routes/home'
import BoardRulesVisualPage from './routes/board-rules-visual'
import LandingPage from './routes/landing'
import LoginPage from './routes/login'
import RegisterPage from './routes/register'
import WorkbenchPage from './routes/workbench'
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
            <a href="/home">Go home</a>
          </Button>
        </div>
      </section>
    </main>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/home', element: <HomePage /> },
  { path: '/workbench', element: <WorkbenchPage />, errorElement: <WorkbenchRouteError /> },
  { path: '/workbench/board-rules-visual', element: <BoardRulesVisualPage /> },
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
