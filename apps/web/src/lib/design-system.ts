import type { CSSProperties } from 'react'

import designSystemConfig from '@/config/design-system.json'

type DesignSystemConfig = typeof designSystemConfig
type FontFamilyName = keyof DesignSystemConfig['fontFamilies']
export type TypographyRoleName = keyof DesignSystemConfig['typography']['roles']

type TypographyRole = DesignSystemConfig['typography']['roles'][TypographyRoleName]

export const designSystem = designSystemConfig

export type FontSlotName = keyof DesignSystemConfig['fontFamilies']
export type FontFaceOption = { value: string; label: string; stack: string }
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
  return fontFamily ? `var(${fontFamily.cssVariable})` : 'inherit'
}

export function getTypographyRole(roleName: TypographyRoleName): TypographyRole {
  return designSystemConfig.typography.roles[roleName]
}

export function typographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)

  return {
    fontFamily: fontFamilyValue(role.fontFamily),
    fontSize: role.fontSize,
    fontWeight: role.fontWeight,
    lineHeight: role.lineHeight,
    letterSpacing: 'letterSpacing' in role ? role.letterSpacing : undefined,
    textTransform:
      'textTransform' in role ? (role.textTransform as CSSProperties['textTransform']) : undefined,
    fontVariantNumeric: 'fontVariantNumeric' in role ? role.fontVariantNumeric : undefined,
  }
}

export function rowTypographyStyle(roleName: TypographyRoleName): CSSProperties {
  const role = getTypographyRole(roleName)

  return {
    ...typographyStyle(roleName),
    height: 'rowHeight' in role ? role.rowHeight : undefined,
  }
}
