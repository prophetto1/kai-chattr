import { chattrJson } from '@/lib/chattr-api'

export type ThemeSummary = {
  id: string
  label: string
  description: string
  color_scheme: 'light' | 'dark'
  html_classes: string[]
}

export type ThemeCatalog = {
  items: ThemeSummary[]
  selected_theme: string
}

export type FontSlot = 'ui' | 'display' | 'prose' | 'mono'

export type WorkbenchSettings = {
  selected_theme?: string
  fonts?: Partial<Record<FontSlot, string>>
  [key: string]: unknown
}

export type SettingsSchemaOption = {
  value: string
  label: string
  description?: string
  color_scheme?: 'light' | 'dark'
  html_classes?: string[]
}

export type SettingsSchemaField = {
  type?: string
  enum?: string[]
  default?: string
  'x-options'?: SettingsSchemaOption[]
}

export type WorkbenchSettingsSchema = {
  properties: {
    selected_theme?: SettingsSchemaField
    fonts?: SettingsSchemaField
  }
  required?: string[]
}

export function listThemes() {
  return chattrJson<ThemeCatalog>('/api/themes')
}

export function getSettings() {
  return chattrJson<WorkbenchSettings>('/api/settings')
}

export function getSettingsSchema() {
  return chattrJson<WorkbenchSettingsSchema>('/api/settings/schema')
}

export function updateSelectedTheme(selectedTheme: string) {
  return chattrJson<WorkbenchSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ selected_theme: selectedTheme }),
  })
}

export function patchSettings(settings: WorkbenchSettings) {
  return chattrJson<WorkbenchSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}
