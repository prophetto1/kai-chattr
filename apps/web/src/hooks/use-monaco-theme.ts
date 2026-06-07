import { useSyncExternalStore } from 'react'

/**
 * Resolves the Monaco editor theme from the app's active color mode.
 *
 * The app toggles dark mode via the `dark` class on <html> (Tailwind). Monaco
 * does not read CSS variables, so it needs an explicit theme name. This hook
 * mirrors the `.dark` class reactively, so editors switch with the app theme
 * instead of defaulting to the light `vs` theme (white background in dark mode).
 */
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributeFilter: ['class'],
    attributes: true,
  })
  return () => observer.disconnect()
}

function getSnapshot(): 'vs-dark' | 'light' {
  return document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'
}

export function useMonacoTheme(): 'vs-dark' | 'light' {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'vs-dark')
}
