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
  getSettingsSchema,
  listThemes,
  patchSettings,
  type WorkbenchSettings,
  type WorkbenchSettingsSchema,
} from '@/lib/theme-api'
import type { ThemeSummary } from '@/lib/theme-api'
import {
  applyThemeTypeVariables,
  builtInDefaultTheme,
  fontSlotCatalog,
  mergeThemeWithTypeOverrides,
  type FontFaceOption,
  type FontSlotName,
  type ThemeTypeOverrides,
} from '@/lib/design-system'

const DEFAULT_THEME_ID = 'night'

const FONT_SLOT_LABELS: Record<FontSlotName, string> = {
  ui: 'Interface',
  display: 'Display',
  prose: 'Reading',
  mono: 'Code',
}

const FONT_SLOT_DESCRIPTIONS: Record<FontSlotName, string> = {
  ui: 'Chrome, menus, and dense body — the workhorse face.',
  display: 'Headings, page titles, and brand moments.',
  prose: 'Chat messages and long-form reading.',
  mono: 'Terminal, code, and diffs.',
}

const FALLBACK_THEMES: ThemeSummary[] = [
  { id: 'day', label: 'Day', description: 'Light token palette', color_scheme: 'light', html_classes: [] },
  { id: 'night', label: 'Night', description: 'Default dark token palette', color_scheme: 'dark', html_classes: ['dark'] },
  {
    id: 'catppuccin',
    label: 'Catppuccin',
    description: 'Mocha token palette',
    color_scheme: 'dark',
    html_classes: ['dark', 'catppuccin'],
  },
  { id: 'ember', label: 'Ember', description: 'Warm dark token palette', color_scheme: 'dark', html_classes: ['dark', 'ember'] },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Achromatic gray dark palette',
    color_scheme: 'dark',
    html_classes: ['dark', 'graphite'],
  },
]

function normalizeThemeOptions(
  themeCatalog: ThemeSummary[] | undefined,
  schemaThemeOptions: ReadonlyArray<{ value: string; label: string; description?: string; color_scheme?: 'light' | 'dark'; html_classes?: string[] }> | undefined,
): ThemeSummary[] {
  if (themeCatalog && themeCatalog.length > 0) {
    return themeCatalog
  }

  const schemaThemes = (schemaThemeOptions ?? [])
    .filter((option) => !!option?.value?.trim())
    .map<ThemeSummary>((option) => ({
      id: option.value,
      label: option.label,
      description: option.description ?? option.value,
      color_scheme: option.color_scheme ?? 'light',
      html_classes: option.html_classes ?? [],
    }))

  return schemaThemes.length > 0 ? schemaThemes : FALLBACK_THEMES
}

function applyThemeClasses(themes: ThemeSummary[], selectedTheme: string) {
  const root = document.documentElement

  const managed = new Set<string>()
  for (const theme of themes) {
    for (const className of theme.html_classes ?? []) {
      managed.add(className)
    }
  }
  for (const className of managed) {
    root.classList.remove(className)
  }

  const selected = themes.find((theme) => theme.id === selectedTheme) ?? themes[0]
  for (const className of selected?.html_classes ?? []) {
    root.classList.add(className)
  }

  root.dataset.theme = selected?.id ?? DEFAULT_THEME_ID
  if (selected?.color_scheme) {
    root.style.colorScheme = selected.color_scheme
  }
}

export type FontSlotView = {
  slot: FontSlotName
  label: string
  description: string
  cssVariable: string
  options: FontFaceOption[]
  selected: string
}

type AppThemeContextValue = {
  error: Error | null
  isLoading: boolean
  isSaving: boolean
  selectedTheme: string
  setTheme: (themeId: string) => void
  themes: ThemeSummary[]
  fontSlots: FontSlotView[]
  typeOverrides: ThemeTypeOverrides
  saveTypographySettings: (settings: {
    fonts: Partial<Record<FontSlotName, string>>
    typeOverrides: ThemeTypeOverrides
  }) => void
  settingsSchema: WorkbenchSettingsSchema | null
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const themesQuery = useQuery({ queryKey: ['app-theme', 'themes'], queryFn: listThemes })
  const settingsQuery = useQuery({ queryKey: ['app-theme', 'settings'], queryFn: getSettings })
  const settingsSchemaQuery = useQuery({
    queryKey: ['app-theme', 'settings-schema'],
    queryFn: getSettingsSchema,
  })

  const themeSchemaOptions = settingsSchemaQuery.data?.properties?.selected_theme?.['x-options']
  const themes = normalizeThemeOptions(themesQuery.data?.items, themeSchemaOptions)
  const schemaThemeDefault = settingsSchemaQuery.data?.properties?.selected_theme?.default

  const selectedThemeFromSettings = settingsQuery.data?.selected_theme
  const selectedTheme =
    typeof selectedThemeFromSettings === 'string' && themes.some((theme) => theme.id === selectedThemeFromSettings)
      ? selectedThemeFromSettings
      : typeof schemaThemeDefault === 'string' && themes.some((theme) => theme.id === schemaThemeDefault)
        ? schemaThemeDefault
        : DEFAULT_THEME_ID

  const savedFonts = settingsQuery.data?.fonts
  const fontSlots = useMemo<FontSlotView[]>(() => {
    return fontSlotCatalog().map((entry) => {
      const saved = savedFonts?.[entry.slot]
      const selected =
        typeof saved === 'string' && entry.options.some((option) => option.value === saved)
          ? saved
          : entry.default
      return {
        slot: entry.slot,
        label: FONT_SLOT_LABELS[entry.slot] ?? entry.slot,
        description: FONT_SLOT_DESCRIPTIONS[entry.slot] ?? '',
        cssVariable: entry.cssVariable,
        options: entry.options,
        selected,
      }
    })
  }, [savedFonts])

  const typeOverrides = useMemo<ThemeTypeOverrides>(() => {
    const rawOverrides = settingsQuery.data?.type_overrides
    return rawOverrides && typeof rawOverrides === 'object' ? rawOverrides : { roles: {} }
  }, [settingsQuery.data?.type_overrides])

  const activeTypographyTheme = useMemo(
    () => mergeThemeWithTypeOverrides(builtInDefaultTheme, typeOverrides),
    [typeOverrides],
  )

  useEffect(() => {
    applyThemeClasses(themes, selectedTheme)
  }, [themes, selectedTheme])

  useEffect(() => {
    const root = document.documentElement
    applyThemeTypeVariables(root, activeTypographyTheme)
    for (const slot of fontSlots) {
      const option = slot.options.find((candidate) => candidate.value === slot.selected)
      if (option) {
        root.style.setProperty(slot.cssVariable, option.stack)
      }
    }
  }, [activeTypographyTheme, fontSlots])

  const updateSettingsMutation = useMutation({
    mutationFn: patchSettings,
    onMutate: async (incomingSettings: WorkbenchSettings) => {
      await queryClient.cancelQueries({ queryKey: ['app-theme', 'settings'] })
      const previousSettings = queryClient.getQueryData<WorkbenchSettings>(['app-theme', 'settings'])
      queryClient.setQueryData<WorkbenchSettings>(['app-theme', 'settings'], {
        ...(previousSettings ?? {}),
        ...incomingSettings,
        fonts: { ...(previousSettings?.fonts ?? {}), ...(incomingSettings.fonts ?? {}) },
      })
      return { previousSettings }
    },
    onError: (_error, _incomingSettings, context) => {
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
            : settingsSchemaQuery.error instanceof Error
              ? settingsSchemaQuery.error
              : null,
      isLoading: themesQuery.isLoading || settingsQuery.isLoading || settingsSchemaQuery.isLoading,
      isSaving: updateSettingsMutation.isPending,
      selectedTheme,
      setTheme: (themeId) => {
        if (themes.some((theme) => theme.id === themeId)) {
          updateSettingsMutation.mutate({ selected_theme: themeId })
        }
      },
      themes,
      fontSlots,
      typeOverrides,
      saveTypographySettings: ({ fonts, typeOverrides: nextTypeOverrides }) => {
        const normalizedFonts: Partial<Record<FontSlotName, string>> = {}
        const catalog = fontSlotCatalog()
        for (const entry of catalog) {
          const value = fonts[entry.slot]
          if (typeof value === 'string' && entry.options.some((option) => option.value === value)) {
            normalizedFonts[entry.slot] = value
          }
        }
        updateSettingsMutation.mutate({
          fonts: normalizedFonts,
          type_overrides: { roles: nextTypeOverrides.roles ?? {} },
        })
      },
      settingsSchema: settingsSchemaQuery.data ?? null,
    }),
    [
      selectedTheme,
      themes,
      fontSlots,
      typeOverrides,
      settingsQuery.data,
      settingsQuery.error,
      settingsQuery.isLoading,
      themesQuery.error,
      themesQuery.isLoading,
      settingsSchemaQuery.error,
      settingsSchemaQuery.isLoading,
      settingsSchemaQuery.data,
      updateSettingsMutation,
    ],
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
