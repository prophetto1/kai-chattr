import type { CSSProperties } from 'react'

import designSystemConfig from '@/config/design-system.json'
import defaultThemeConfig from '@/config/themes/default.theme.json'

type DesignSystemConfig = typeof designSystemConfig
type FontFamilyName = keyof DesignSystemConfig['fontFamilies']
export type TypographyRoleName = keyof DesignSystemConfig['typography']['roles']

type TypographyRole<Name extends TypographyRoleName = TypographyRoleName> =
  DesignSystemConfig['typography']['roles'][Name]
export type ThemeTypographyRole = {
  family?: string
  size?: string
  line?: string
  weight?: number | string
  selectedWeight?: number | string
  tracking?: string
  transform?: string
  numeric?: string
  rowHeight?: string
}

export type ThemeDefinition = {
  id: string
  label: string
  description?: string
  extends?: string
  colorScheme?: 'light' | 'dark'
  colors?: Record<string, string>
  type?: {
    scales?: Record<string, number>
    roles?: Record<string, ThemeTypographyRole>
    areas?: Record<string, ThemeTypographyRole>
  }
}

export const designSystem = designSystemConfig
export const builtInDefaultTheme = defaultThemeConfig as ThemeDefinition

export type FontSlotName = keyof DesignSystemConfig['fontFamilies']
export type FontFaceOption = { value: string; label: string; stack: string }
export type ThemeTypeOverrides = {
  roles?: Record<string, ThemeTypographyRole>
}
export type FontSlotCatalogEntry = {
  slot: FontSlotName
  cssVariable: string
  default: string
  options: FontFaceOption[]
}

/** The selectable typeface catalog per font-family slot, driven by design-system.json. */
export function fontSlotCatalog(): FontSlotCatalogEntry[] {
  return (Object.keys(designSystemConfig.fontFamilies) as FontSlotName[]).map((slot) => {
    const family = designSystemConfig.fontFamilies[slot] as {
      cssVariable: string
      default?: string
      options?: FontFaceOption[]
    }
    const options = family.options ?? []
    return {
      slot,
      cssVariable: family.cssVariable,
      default: family.default ?? options[0]?.value ?? '',
      options,
    }
  })
}

function fontFamilyValue(fontFamilyName: string) {
  const fontFamily = designSystemConfig.fontFamilies[fontFamilyName as FontFamilyName]
  if (fontFamily) {
    return `var(${fontFamily.cssVariable})`
  }

  for (const catalogEntry of fontSlotCatalog()) {
    const option = catalogEntry.options.find((candidate) => candidate.value === fontFamilyName)
    if (option) {
      return option.stack
    }
  }

  return 'inherit'
}

function roleCssVarStem(roleName: string) {
  return roleName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function roleCssVarName(roleName: TypographyRoleName, token: string) {
  return `--type-${roleCssVarStem(String(roleName))}-${token}`
}

function cssVarReference(roleName: TypographyRoleName, token: string, fallback?: string | number) {
  const variableName = roleCssVarName(roleName, token)
  return fallback === undefined ? `var(${variableName})` : `var(${variableName}, ${fallback})`
}

function getDefaultThemeRole(roleName: TypographyRoleName): ThemeTypographyRole {
  return builtInDefaultTheme.type?.roles?.[String(roleName)] ?? {}
}

function roleValue(value: string | number | undefined) {
  return value === undefined ? undefined : String(value)
}

export function themeTypeVariableEntries(theme: ThemeDefinition = builtInDefaultTheme) {
  const entries: Array<[string, string]> = []
  const roles = theme.type?.roles ?? {}

  for (const [roleName, role] of Object.entries(roles)) {
    const typedRoleName = roleName as TypographyRoleName
    if (role.family) {
      entries.push([roleCssVarName(typedRoleName, 'family'), fontFamilyValue(role.family)])
    }
    if (role.size) {
      entries.push([roleCssVarName(typedRoleName, 'size'), role.size])
    }
    if (role.line) {
      entries.push([roleCssVarName(typedRoleName, 'line'), role.line])
    }
    const weight = roleValue(role.weight)
    if (weight) {
      entries.push([roleCssVarName(typedRoleName, 'weight'), weight])
    }
    const selectedWeight = roleValue(role.selectedWeight)
    if (selectedWeight) {
      entries.push([roleCssVarName(typedRoleName, 'selected-weight'), selectedWeight])
    }
    if (role.tracking) {
      entries.push([roleCssVarName(typedRoleName, 'tracking'), role.tracking])
    }
    if (role.transform) {
      entries.push([roleCssVarName(typedRoleName, 'transform'), role.transform])
    }
    if (role.numeric) {
      entries.push([roleCssVarName(typedRoleName, 'numeric'), role.numeric])
    }
    if (role.rowHeight) {
      entries.push([roleCssVarName(typedRoleName, 'row-height'), role.rowHeight])
    }
  }

  return entries
}

export function applyThemeTypeVariables(root: HTMLElement, theme: ThemeDefinition = builtInDefaultTheme) {
  for (const [name, value] of themeTypeVariableEntries(theme)) {
    root.style.setProperty(name, value)
  }
}

export function mergeThemeWithTypeOverrides(
  theme: ThemeDefinition = builtInDefaultTheme,
  overrides?: ThemeTypeOverrides,
): ThemeDefinition {
  const overrideRoles = overrides?.roles ?? {}
  if (Object.keys(overrideRoles).length === 0) {
    return theme
  }

  const roles = { ...(theme.type?.roles ?? {}) }
  for (const [roleName, roleOverride] of Object.entries(overrideRoles)) {
    roles[roleName] = {
      ...(roles[roleName] ?? {}),
      ...roleOverride,
    }
  }

  return {
    ...theme,
    type: {
      ...(theme.type ?? {}),
      roles,
    },
  }
}

export type TypographyRoleGroup = {
  id: FontSlotName
  label: string
  roles: TypographyRoleView[]
}

export type TypographyRoleView = {
  name: TypographyRoleName
  defaultRole: ThemeTypographyRole
  overrideRole: ThemeTypographyRole
  resolvedRole: ThemeTypographyRole
  isCustomized: boolean
}

const TYPOGRAPHY_GROUP_LABELS: Record<FontSlotName, string> = {
  ui: 'Interface',
  display: 'Display',
  prose: 'Reading',
  mono: 'Code',
}

function roleGroupId(roleName: string, role: ThemeTypographyRole): FontSlotName {
  if (roleName.startsWith('display.')) return 'display'
  if (roleName.startsWith('prose.')) return 'prose'
  if (roleName.startsWith('code.') || role.family === 'mono') return 'mono'
  return 'ui'
}

export function typographyRoleGroups(overrides?: ThemeTypeOverrides): TypographyRoleGroup[] {
  const groups = new Map<FontSlotName, TypographyRoleView[]>()
  for (const slot of Object.keys(designSystemConfig.fontFamilies) as FontSlotName[]) {
    groups.set(slot, [])
  }

  const defaultRoles = builtInDefaultTheme.type?.roles ?? {}
  const overrideRoles = overrides?.roles ?? {}
  const mergedTheme = mergeThemeWithTypeOverrides(builtInDefaultTheme, overrides)
  const mergedRoles = mergedTheme.type?.roles ?? {}

  for (const roleName of Object.keys(defaultRoles) as TypographyRoleName[]) {
    const defaultRole = defaultRoles[String(roleName)] ?? {}
    const overrideRole = overrideRoles[String(roleName)] ?? {}
    const resolvedRole = mergedRoles[String(roleName)] ?? defaultRole
    const groupId = roleGroupId(String(roleName), resolvedRole)
    const groupRoles = groups.get(groupId)
    if (!groupRoles) continue
    groupRoles.push({
      name: roleName,
      defaultRole,
      overrideRole,
      resolvedRole,
      isCustomized: Object.keys(overrideRole).length > 0,
    })
  }

  return (Object.keys(TYPOGRAPHY_GROUP_LABELS) as FontSlotName[])
    .map((id) => ({
      id,
      label: TYPOGRAPHY_GROUP_LABELS[id],
      roles: groups.get(id) ?? [],
    }))
    .filter((group) => group.roles.length > 0)
}

export function getTypographyRole<Name extends TypographyRoleName>(roleName: Name): TypographyRole<Name> {
  return designSystemConfig.typography.roles[roleName]
}

export function typographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)
  const defaultThemeRole = getDefaultThemeRole(roleName)
  const family = defaultThemeRole.family ?? role.fontFamily
  const size = defaultThemeRole.size ?? role.fontSize
  const line = defaultThemeRole.line ?? role.lineHeight
  const weight = defaultThemeRole.weight ?? role.fontWeight
  const tracking =
    defaultThemeRole.tracking ??
    ('letterSpacing' in role ? role.letterSpacing : undefined)
  const transform =
    defaultThemeRole.transform ??
    ('textTransform' in role ? (role.textTransform as string) : undefined)
  const numeric =
    defaultThemeRole.numeric ??
    ('fontVariantNumeric' in role ? role.fontVariantNumeric : undefined)

  return {
    fontFamily: cssVarReference(roleName, 'family', fontFamilyValue(family)),
    fontSize: cssVarReference(roleName, 'size', size),
    fontWeight: cssVarReference(roleName, 'weight', weight),
    lineHeight: cssVarReference(roleName, 'line', line),
    letterSpacing: tracking ? cssVarReference(roleName, 'tracking', tracking) : undefined,
    textTransform: transform
      ? (cssVarReference(roleName, 'transform', transform) as CSSProperties['textTransform'])
      : undefined,
    fontVariantNumeric: numeric ? cssVarReference(roleName, 'numeric', numeric) : undefined,
  }
}

export function rowTypographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)
  const defaultThemeRole = getDefaultThemeRole(roleName)
  const rowHeight =
    defaultThemeRole.rowHeight ??
    ('rowHeight' in role ? role.rowHeight : undefined)

  return {
    ...typographyStyle(roleName),
    height: rowHeight ? cssVarReference(roleName, 'row-height', rowHeight) : undefined,
  }
}
