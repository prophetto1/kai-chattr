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

export type WorkbenchSettings = {
  selected_theme?: string
  [key: string]: unknown
}

export function listThemes() {
  return chattrJson<ThemeCatalog>('/api/themes')
}

export function getSettings() {
  return chattrJson<WorkbenchSettings>('/api/settings')
}

export function updateSelectedTheme(selectedTheme: string) {
  return chattrJson<WorkbenchSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ selected_theme: selectedTheme }),
  })
}
