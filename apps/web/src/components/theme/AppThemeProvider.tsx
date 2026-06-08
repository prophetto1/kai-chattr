import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getSettings,
  listThemes,
  type ThemeSummary,
  type WorkbenchSettings,
  updateSelectedTheme,
} from '@/lib/theme-api'

const DEFAULT_THEME_ID = 'night'
const FALLBACK_THEMES: ThemeSummary[] = [
  {
    id: 'day',
    label: 'Day',
    description: 'Light token palette',
    color_scheme: 'light',
    html_classes: [],
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Default dark token palette',
    color_scheme: 'dark',
    html_classes: ['dark'],
  },
  {
    id: 'catppuccin',
    label: 'Catppuccin',
    description: 'Mocha token palette',
    color_scheme: 'dark',
    html_classes: ['dark', 'catppuccin'],
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm dark token palette',
    color_scheme: 'dark',
    html_classes: ['dark', 'ember'],
  },
]

type AppThemeContextValue = {
  error: Error | null
  isLoading: boolean
  isSaving: boolean
  selectedTheme: string
  setTheme: (themeId: string) => void
  themes: ThemeSummary[]
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

function applyTheme(themeId: string, fetchedThemes: ThemeSummary[]) {
  const themes = fetchedThemes.length > 0 ? fetchedThemes : FALLBACK_THEMES
  const selectedTheme =
    themes.find((theme) => theme.id === themeId) ??
    themes.find((theme) => theme.id === DEFAULT_THEME_ID) ??
    FALLBACK_THEMES[1]
  const knownClasses = new Set(FALLBACK_THEMES.flatMap((theme) => theme.html_classes))
  const root = document.documentElement

  for (const className of knownClasses) {
    root.classList.remove(className)
  }
  for (const className of selectedTheme.html_classes) {
    root.classList.add(className)
  }
  root.dataset.theme = selectedTheme.id
  root.style.colorScheme = selectedTheme.color_scheme
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const themesQuery = useQuery({
    queryKey: ['app-theme', 'themes'],
    queryFn: listThemes,
  })
  const settingsQuery = useQuery({
    queryKey: ['app-theme', 'settings'],
    queryFn: getSettings,
  })
  const themes = themesQuery.data?.items ?? []
  const selectedTheme =
    settingsQuery.data?.selected_theme ??
    themesQuery.data?.selected_theme ??
    DEFAULT_THEME_ID

  useEffect(() => {
    applyTheme(selectedTheme, themes)
  }, [selectedTheme, themes])

  const themeMutation = useMutation({
    mutationFn: updateSelectedTheme,
    onMutate: async (themeId) => {
      await queryClient.cancelQueries({ queryKey: ['app-theme', 'settings'] })
      const previousSettings = queryClient.getQueryData<WorkbenchSettings>([
        'app-theme',
        'settings',
      ])
      queryClient.setQueryData<WorkbenchSettings>(['app-theme', 'settings'], {
        ...(previousSettings ?? {}),
        selected_theme: themeId,
      })
      return { previousSettings }
    },
    onError: (_error, _themeId, context) => {
      queryClient.setQueryData(['app-theme', 'settings'], context?.previousSettings)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-theme', 'settings'] })
      void queryClient.invalidateQueries({ queryKey: ['app-theme', 'themes'] })
    },
  })

  const value = useMemo<AppThemeContextValue>(
    () => ({
      error:
        themesQuery.error instanceof Error
          ? themesQuery.error
          : settingsQuery.error instanceof Error
            ? settingsQuery.error
            : null,
      isLoading: themesQuery.isLoading || settingsQuery.isLoading,
      isSaving: themeMutation.isPending,
      selectedTheme,
      setTheme: (themeId) => {
        if (themes.some((theme) => theme.id === themeId)) {
          themeMutation.mutate(themeId)
        }
      },
      themes,
    }),
    [
      selectedTheme,
      settingsQuery.error,
      settingsQuery.isLoading,
      themeMutation,
      themes,
      themesQuery.error,
      themesQuery.isLoading,
    ]
  )

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  const value = useContext(AppThemeContext)
  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeProvider')
  }
  return value
}
