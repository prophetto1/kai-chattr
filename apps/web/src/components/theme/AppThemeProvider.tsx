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
  type SettingsSchemaOption,
  type WorkbenchSettings,
  type WorkbenchSettingsSchema,
} from '@/lib/theme-api'
import type { ThemeSummary } from '@/lib/theme-api'

const DEFAULT_THEME_ID = 'night'
const DEFAULT_FONT_ID = 'sans'
const DEFAULT_CONTRAST_ID = 'normal'

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
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Achromatic gray dark palette',
    color_scheme: 'dark',
    html_classes: ['dark', 'graphite'],
  },
]

const FALLBACK_FONT_OPTIONS: SettingsSchemaOption[] = [
  { value: 'sans', label: 'Sans', description: 'System UI + Inter', html_classes: ['font-family-sans'] },
  { value: 'serif', label: 'Serif', description: 'Readable display prose', html_classes: ['font-family-serif'] },
  { value: 'mono', label: 'Mono', description: 'Monospace text and code', html_classes: ['font-family-mono'] },
]

const FALLBACK_CONTRAST_OPTIONS: SettingsSchemaOption[] = [
  { value: 'normal', label: 'Normal', description: 'Default contrast', html_classes: ['contrast-normal'] },
  { value: 'high', label: 'High', description: 'Increased contrast', html_classes: ['contrast-high'] },
]

function normalizeSchemaOptions(
  options: ReadonlyArray<SettingsSchemaOption> | undefined,
  fallback: ReadonlyArray<SettingsSchemaOption>,
): SettingsSchemaOption[] {
  const normalized = (options ?? [])
    .filter((option) => !!option?.value?.trim())
    .map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description,
      color_scheme: option.color_scheme,
      html_classes: option.html_classes ?? [],
    }))

  return normalized.length > 0 ? normalized : [...fallback]
}

function normalizeThemeOptions(
  themeCatalog: ThemeSummary[] | undefined,
  schemaThemeOptions: ReadonlyArray<SettingsSchemaOption> | undefined,
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

function collectManagedClasses(...optionGroups: ReadonlyArray<ReadonlyArray<{ html_classes?: string[] }>>) {
  const classes = new Set<string>()

  for (const group of optionGroups) {
    for (const option of group) {
      if (!option?.html_classes) {
        continue
      }
      for (const className of option.html_classes) {
        classes.add(className)
      }
    }
  }

  return classes
}

function applyWorkbenchThemeSettings({
  selectedTheme,
  selectedFont,
  selectedContrast,
  themes,
  fontOptions,
  contrastOptions,
}: {
  selectedTheme: string
  selectedFont: string
  selectedContrast: string
  themes: ThemeSummary[]
  fontOptions: SettingsSchemaOption[]
  contrastOptions: SettingsSchemaOption[]
}) {
  const root = document.documentElement

  const selectedThemeOption = themes.find((theme) => theme.id === selectedTheme) ?? themes[0]
  const selectedFontOption = fontOptions.find((option) => option.value === selectedFont) ?? fontOptions[0]
  const selectedContrastOption =
    contrastOptions.find((option) => option.value === selectedContrast) ?? contrastOptions[0]

  const managedClasses = collectManagedClasses(themes, fontOptions, contrastOptions)
  for (const className of managedClasses) {
    root.classList.remove(className)
  }

  for (const className of selectedThemeOption?.html_classes ?? []) {
    root.classList.add(className)
  }
  for (const className of selectedFontOption?.html_classes ?? []) {
    root.classList.add(className)
  }
  for (const className of selectedContrastOption?.html_classes ?? []) {
    root.classList.add(className)
  }

  root.dataset.theme = selectedThemeOption?.id ?? DEFAULT_THEME_ID

  if (selectedThemeOption?.color_scheme) {
    root.style.colorScheme = selectedThemeOption.color_scheme
  }
}

type AppThemeContextValue = {
  error: Error | null
  isLoading: boolean
  isSaving: boolean
  selectedTheme: string
  selectedFont: string
  selectedContrast: string
  setTheme: (themeId: string) => void
  setFont: (font: string) => void
  setContrast: (contrast: string) => void
  themes: ThemeSummary[]
  fontOptions: SettingsSchemaOption[]
  contrastOptions: SettingsSchemaOption[]
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
  const fontSchemaOptions = settingsSchemaQuery.data?.properties?.font?.['x-options']
  const contrastSchemaOptions = settingsSchemaQuery.data?.properties?.contrast?.['x-options']
  const themes = normalizeThemeOptions(themesQuery.data?.items, themeSchemaOptions)
  const fontOptions = normalizeSchemaOptions(fontSchemaOptions, FALLBACK_FONT_OPTIONS)
  const contrastOptions = normalizeSchemaOptions(contrastSchemaOptions, FALLBACK_CONTRAST_OPTIONS)

  const schemaThemeDefault = settingsSchemaQuery.data?.properties?.selected_theme?.default
  const schemaFontDefault = settingsSchemaQuery.data?.properties?.font?.default
  const schemaContrastDefault = settingsSchemaQuery.data?.properties?.contrast?.default

  const selectedThemeFromSettings = settingsQuery.data?.selected_theme
  const selectedFontFromSettings = settingsQuery.data?.font
  const selectedContrastFromSettings = settingsQuery.data?.contrast

  const selectedTheme =
    typeof selectedThemeFromSettings === 'string' && themes.some((theme) => theme.id === selectedThemeFromSettings)
      ? selectedThemeFromSettings
      : typeof schemaThemeDefault === 'string' && themes.some((theme) => theme.id === schemaThemeDefault)
        ? schemaThemeDefault
        : DEFAULT_THEME_ID

  const selectedFont =
    typeof selectedFontFromSettings === 'string' && fontOptions.some((option) => option.value === selectedFontFromSettings)
      ? selectedFontFromSettings
      : typeof schemaFontDefault === 'string' && fontOptions.some((option) => option.value === schemaFontDefault)
        ? schemaFontDefault
        : DEFAULT_FONT_ID

  const selectedContrast =
    typeof selectedContrastFromSettings === 'string' &&
      contrastOptions.some((option) => option.value === selectedContrastFromSettings)
      ? selectedContrastFromSettings
      : typeof schemaContrastDefault === 'string' &&
          contrastOptions.some((option) => option.value === schemaContrastDefault)
        ? schemaContrastDefault
        : DEFAULT_CONTRAST_ID

  useEffect(() => {
    applyWorkbenchThemeSettings({
      selectedTheme,
      selectedFont,
      selectedContrast,
      themes,
      fontOptions,
      contrastOptions,
    })
  }, [selectedTheme, selectedFont, selectedContrast, themes, fontOptions, contrastOptions])

  const updateSettingsMutation = useMutation({
    mutationFn: patchSettings,
    onMutate: async (incomingSettings: WorkbenchSettings) => {
      await queryClient.cancelQueries({ queryKey: ['app-theme', 'settings'] })
      const previousSettings = queryClient.getQueryData<WorkbenchSettings>(['app-theme', 'settings'])
      queryClient.setQueryData<WorkbenchSettings>(['app-theme', 'settings'], {
        ...(previousSettings ?? {}),
        ...incomingSettings,
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
      isLoading:
        themesQuery.isLoading ||
        settingsQuery.isLoading ||
        settingsSchemaQuery.isLoading,
      isSaving: updateSettingsMutation.isPending,
      selectedTheme,
      selectedFont,
      selectedContrast,
      setFont: (font) => {
        if (!fontOptions.some((option) => option.value === font)) {
          return
        }
        updateSettingsMutation.mutate({ font })
      },
      setContrast: (contrast) => {
        if (!contrastOptions.some((option) => option.value === contrast)) {
          return
        }
        updateSettingsMutation.mutate({ contrast })
      },
      setTheme: (themeId) => {
        if (themes.some((theme) => theme.id === themeId)) {
          updateSettingsMutation.mutate({ selected_theme: themeId })
        }
      },
      themes,
      fontOptions,
      contrastOptions,
      settingsSchema: settingsSchemaQuery.data ?? null,
    }),
    [
      contrastOptions,
      selectedTheme,
      selectedFont,
      selectedContrast,
      settingsQuery.error,
      themes,
      themesQuery.error,
      themesQuery.isLoading,
      fontOptions,
      settingsSchemaQuery.error,
      settingsSchemaQuery.isLoading,
      updateSettingsMutation,
      settingsQuery.isLoading,
      settingsSchemaQuery.data,
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
